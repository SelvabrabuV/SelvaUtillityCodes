using System.Text.Json;
using DiffDesk.Domain;

namespace DiffDesk.Infrastructure;

public sealed class JsonSessionRepository : ISessionRepository
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _path;
    private readonly string _workspacePath;

    public JsonSessionRepository()
        : this(Path.Combine(AppLocations.Root(), "sessions.json"))
    {
    }

    public JsonSessionRepository(string path)
    {
        _path = path;
        _workspacePath = Path.Combine(Path.GetDirectoryName(path) ?? Path.GetTempPath(), "workspace.json");
    }

    public IReadOnlyList<SessionRecord> List() => Read().OrderByDescending(static session => session.LastOpened).ToList();

    public void Save(SessionRecord session)
    {
        var sessions = Read().Where(item => item.Id != session.Id).ToList();
        sessions.Add(session);
        Write(sessions);
    }

    public void Delete(string id) => Write(Read().Where(item => item.Id != id).ToList());

    public SessionRecord? Find(string id) => Read().FirstOrDefault(item => item.Id == id);

    public SessionRecord Duplicate(string id)
    {
        var found = Find(id) ?? throw new InvalidOperationException("That session was not found.");
        var copy = found with { Id = Guid.NewGuid().ToString("N"), Name = found.Name + " copy", LastOpened = DateTimeOffset.Now };
        Save(copy);
        return copy;
    }

    public void Export(string id, string path)
    {
        var found = Find(id) ?? throw new InvalidOperationException("That session was not found.");
        File.WriteAllText(path, JsonSerializer.Serialize(found, Json));
    }

    public SessionRecord Import(string path)
    {
        var session = JsonSerializer.Deserialize<SessionRecord>(File.ReadAllText(path), Json)
            ?? throw new InvalidOperationException("The session file is empty.");
        session = session with { Id = Guid.NewGuid().ToString("N"), LastOpened = DateTimeOffset.Now };
        Save(session);
        return session;
    }

    public void SaveWorkspace(WorkspaceSnapshot snapshot)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_workspacePath)!);
        File.WriteAllText(_workspacePath, JsonSerializer.Serialize(snapshot, Json));
    }

    public WorkspaceSnapshot? LoadWorkspace()
    {
        if (!File.Exists(_workspacePath))
            return null;
        return JsonSerializer.Deserialize<WorkspaceSnapshot>(File.ReadAllText(_workspacePath), Json);
    }

    private List<SessionRecord> Read()
    {
        if (!File.Exists(_path))
            return [];
        return JsonSerializer.Deserialize<List<SessionRecord>>(File.ReadAllText(_path), Json) ?? [];
    }

    private void Write(List<SessionRecord> sessions)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, JsonSerializer.Serialize(sessions, Json));
    }
}

public sealed class JsonSettingsStore : ISettingsStore
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _path;

    public JsonSettingsStore()
        : this(Path.Combine(AppLocations.Root(), "settings.json"))
    {
    }

    public JsonSettingsStore(string path) => _path = path;

    public AppSettings Load()
    {
        if (!File.Exists(_path))
            return new AppSettings();
        return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_path), Json) ?? new AppSettings();
    }

    public void Save(AppSettings settings)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, JsonSerializer.Serialize(settings, Json));
    }
}
