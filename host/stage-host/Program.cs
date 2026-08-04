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

static IResult Refused(StageRefusedException e) =>
    Results.Json(new { error = e.Message, reason = e.Reason.ToString() }, statusCode: 409);

// An adapter that refuses is the product working; an adapter that faults is a
// bug. Both leave the library as the same exception type, so mapping on the
// type would put them under one code — which is what a 500 already did, and a
// 500 reads as "we broke". The distinction we can make honestly is **which
// door it came out of**: adapter-api §3 names `prepare` as the door that must
// refuse a document it cannot execute honestly, so an exception out of that one
// call is a refusal by contract. Every other adapter call keeps its 500.
//
// 409 stays the library's own verdicts (their `reason` is a library enum);
// 422 says the lifecycle gates had no objection and the backend could not carry
// out these instructions against the live world. The payload names the layer so
// a stored refusal still says what judged it once the status code is gone.
static IResult AdapterRefused(InvalidOperationException e) =>
    Results.Json(new { error = e.Message, reason = "AdapterRefused" }, statusCode: 422);

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
    var active = await adapter.ActiveStateAsync(target);
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
        catch (InvalidOperationException e)
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
