using DiffDesk.Infrastructure;

namespace DiffDesk.Desktop;

internal static class AppHost
{
    public static IServiceProvider Services { get; } = DiffDeskServices.Build();

    public static T Get<T>() where T : class
    {
        var service = Services.GetService(typeof(T));
        return service as T ?? throw new InvalidOperationException("DiffDesk could not create " + typeof(T).Name + ".");
    }
}
