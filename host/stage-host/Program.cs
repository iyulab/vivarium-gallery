// gallery sample stage host — the thin HTTP face that
// samples/gallery/host/server.ts proxies `/stage/*` requests to. Wires the hosting-neutral Vivarium.Stage core (ADR-0003) to the
// in-memory reference adapter; every screen change goes through the full
// lifecycle: propose → branch (+prepare = simulation preview) → apply
// (fingerprint gate, drift gate, write-ahead ledger, atomic flip) → rollback.
//
// Sample harness only: no auth, in-memory state, single process.
// Usage: dotnet run --project samples/gallery/host/stage-host [-- port]

using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using Vivarium.Stage;
using Vivarium.Stage.Adapters;
using Vivarium.Stage.Ledger;

var port = args.Length > 0 && int.TryParse(args[^1], out var p) ? p : 8891;
var builder = WebApplication.CreateBuilder();
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();

var adapter = new InMemoryBackendAdapter();
var ledger = new ReleaseLedger(new InMemoryLedgerStore());
var sessions = new ConcurrentDictionary<string, ChangeSession>();

static JsonObject ArtifactsOf(InMemoryBackendAdapter adapter, string stateRef) =>
    (JsonObject)((JsonObject)JsonNode.Parse(adapter.WorldCanonical(stateRef))!)["artifacts"]!.DeepClone();

// `details` is what the refusing gate observed (the drifted refs with expected and
// actual fingerprints, the per-error validation paths, …) — forwarded as-is so a
// client can act on the difference without parsing `error`. Absent where the
// library deliberately carries none.
static IResult Refused(StageRefusedException e) =>
    e.Details is null
        ? Results.Json(new { error = e.Message, reason = e.Reason.ToString() }, statusCode: 409)
        : Results.Json(new { error = e.Message, reason = e.Reason.ToString(), details = e.Details }, statusCode: 409);

// An adapter that refuses is the product working; an adapter that faults is a
// bug. The adapter contract names its refusals (`AdapterRefusedException`,
// adapter-api §6), so the two are told apart by type and anything else an
// adapter throws stays a 500 — a fault, reported as one.
//
// 409 stays the library's own verdicts (their `reason` is a library enum);
// 422 says the lifecycle gates had no objection and the backend could not carry
// out these instructions against the live world. `reason` names the layer so a
// stored refusal still says what judged it once the status code is gone;
// `adapterReason` and `details` are the adapter's own, forwarded as-is — for a
// document refusal, `details.errors` locates each problem in the changeset.
static IResult AdapterRefused(AdapterRefusedException e) =>
    e.Details is null
        ? Results.Json(new { error = e.Message, reason = "AdapterRefused", adapterReason = e.Reason.ToString() }, statusCode: 422)
        : Results.Json(new { error = e.Message, reason = "AdapterRefused", adapterReason = e.Reason.ToString(), details = e.Details }, statusCode: 422);

// A target the adapter has never been asked to seed is absent, not a document the
// backend declined — the refusal names the resource, so it answers as one (404),
// with the same `reason` whichever door asked about the target.
static IResult AdapterAnswer(AdapterRefusedException e) =>
    e.Reason == AdapterRefusalReason.UnknownTarget
        ? Results.Json(new { error = e.Message, reason = "UnknownTarget" }, statusCode: 404)
        : AdapterRefused(e);

// Seed a target's live world. Sample bootstrap only — not part of the lifecycle.
app.MapPost("/targets", async (HttpRequest request) =>
{
    var body = (JsonObject)(await JsonNode.ParseAsync(request.Body))!;
    var target = body["target"]!.GetValue<string>();
    var world = new JsonObject
    {
        ["schema"] = body["schema"]?.DeepClone() ?? new JsonObject { ["entities"] = new JsonObject() },
        ["data"] = body["data"]?.DeepClone() ?? new JsonObject(),
        ["artifacts"] = body["artifacts"]?.DeepClone() ?? new JsonObject(),
    };
    adapter.SeedTarget(target, world);
    var active = await adapter.ActiveStateAsync(target);
    return Results.Json(new { stateRef = active.StateRef, fingerprints = active.FacetFingerprints });
});

// Current live world. `artifacts` is what the canvas renders; `schema`/`data`
// and the per-facet fingerprints are what a multi-facet change is judged by —
// a UI-only read cannot tell "all three flipped together" from "the UI flipped
// and the schema didn't", which is exactly the claim a 3-facet exhibit makes.
app.MapGet("/targets/{target}/artifacts", async (string target) =>
{
    ActiveState active;
    try
    {
        active = await adapter.ActiveStateAsync(target);
    }
    catch (AdapterRefusedException e) when (e.Reason == AdapterRefusalReason.UnknownTarget)
    {
        // A target this host has never been asked to seed is absent, not broken — and
        // the app asks about one on every load, before it knows whether a previous
        // session left state behind. The adapter is right to refuse rather than invent
        // a pointer; this answers the refusal as the absence it is.
        return AdapterAnswer(e);
    }
    var world = (JsonObject)JsonNode.Parse(adapter.WorldCanonical(active.StateRef))!;
    return Results.Json(new
    {
        stateRef = active.StateRef,
        artifacts = world["artifacts"]!.DeepClone(),
        schema = world["schema"]!.DeepClone(),
        data = world["data"]!.DeepClone(),
        fingerprints = active.FacetFingerprints,
    });
});

// Propose: admit the changeset into the lifecycle, branch, and prepare the
// branch so the host can simulate against it (the preview IS the branch).
app.MapPost("/targets/{target}/changesets", async (string target, HttpRequest request) =>
{
    var changeset = (JsonObject)(await JsonNode.ParseAsync(request.Body))!;
    try
    {
        var session = new ChangeSession(changeset, target, adapter, ledger);
        var branch = await session.BranchAsync();
        try
        {
            await adapter.PrepareAsync(branch.BranchRef,
                new PreparedFacets(session.Fingerprint, (JsonObject)changeset["patches"]!.DeepClone()));
        }
        catch (AdapterRefusedException e)
        {
            // The branch exists by now and nothing will ever adopt it — a refused
            // document has no session. `discard` is declared always safe (staging
            // never touches live state), so releasing it here is the whole cleanup.
            await adapter.DiscardAsync(branch.BranchRef);
            return AdapterRefused(e);
        }
        var sessionId = Guid.NewGuid().ToString("n")[..12];
        sessions[sessionId] = session;
        return Results.Json(new
        {
            sessionId,
            branchRef = branch.BranchRef,
            fidelity = branch.Fidelity.ToJson(),
            preview = ArtifactsOf(adapter, branch.BranchRef),
        });
    }
    catch (StageRefusedException e)
    {
        return Refused(e);
    }
    catch (AdapterRefusedException e)
    {
        // Branching asks the adapter for the target's live state first; a target it
        // never seeded is refused there, before any document is looked at.
        return AdapterAnswer(e);
    }
});

// Apply: record what the simulation observed, then run the gates and flip.
app.MapPost("/sessions/{id}/apply", async (string id, HttpRequest request) =>
{
    if (!sessions.TryGetValue(id, out var session)) return Results.NotFound();
    var body = (JsonObject?)await JsonNode.ParseAsync(request.Body) ?? [];
    try
    {
        if (session.State == SessionState.Branched)
            session.RecordSimulation(body["evidence"] as JsonObject);
        await session.ApplyAsync(body["actor"]?.GetValue<string>() ?? "demo-operator");
        var active = await adapter.ActiveStateAsync(session.Target);
        return Results.Json(new { state = session.State.ToString(), artifacts = ArtifactsOf(adapter, active.StateRef) });
    }
    catch (StageRefusedException e)
    {
        return Refused(e);
    }
    catch (AdapterRefusedException e)
    {
        // ApplyAsync prepares the approved document before it flips; a backend that
        // refuses it there is the same verdict as at propose, and Stage passes it
        // through unwrapped.
        return AdapterRefused(e);
    }
});

// Rollback: the defined path back (fixed principle 4).
app.MapPost("/sessions/{id}/rollback", async (string id, HttpRequest request) =>
{
    if (!sessions.TryGetValue(id, out var session)) return Results.NotFound();
    var body = (JsonObject?)await JsonNode.ParseAsync(request.Body) ?? [];
    try
    {
        await session.RollbackAsync(body["actor"]?.GetValue<string>() ?? "demo-operator");
        var active = await adapter.ActiveStateAsync(session.Target);
        return Results.Json(new { state = session.State.ToString(), artifacts = ArtifactsOf(adapter, active.StateRef) });
    }
    catch (StageRefusedException e)
    {
        return Refused(e);
    }
});

// The audit trail — append-only, machine-verifiable (fixed principle 6).
app.MapGet("/ledger", async () => Results.Text(await ledger.ExportJsonAsync(), "application/json"));

Console.WriteLine($"stage host: http://localhost:{port}");
app.Run($"http://localhost:{port}");
