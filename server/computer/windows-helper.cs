// Computer use on Windows (server/computer/windows.ts runs it): sees the main display and uses the mouse and keyboard
// through Win32 (SendInput, SetCursorPos, a copy of the screen), and opens apps the Start menu lists. It stays running
// and reads one request per line on stdin, {"id":1,"ops":[...]}, {"id":2,"shot":{"max":1280,"quality":70}} or
// {"id":3,"open":"Notepad"}, and answers each on stdout, {"id":1,"ok":true,"out":{...}}; first it says {"ready":true}.
// The steps are those of plan.ts (Op), in the screen's own pixels (the helper is per-monitor DPI aware); keys come as
// virtual-key codes, text as Unicode characters (any language, whatever the keyboard layout).
//
// The desktop app builds it into hydor-computer.exe with the C# compiler Windows has (.NET Framework's csc); elsewhere
// PowerShell compiles it as it starts (Add-Type). Both are C# 5, so nothing newer than that is used here.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class HydorComputer
{
    // ---- Win32 ----------------------------------------------------------------------------------------------------

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll", SetLastError = true)] static extern bool BitBlt(IntPtr dest, int x, int y, int w, int h, IntPtr source, int sx, int sy, uint rop);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT point, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint MOVE = 0x0001, LEFTDOWN = 0x0002, LEFTUP = 0x0004, RIGHTDOWN = 0x0008, RIGHTUP = 0x0010;
    const uint MIDDLEDOWN = 0x0020, MIDDLEUP = 0x0040, WHEEL = 0x0800, HWHEEL = 0x1000;
    const uint EXTENDEDKEY = 0x0001, KEYUP = 0x0002, UNICODE = 0x0004;
    // The screen copied as it is, layered windows (menus, tooltips) too; .NET's CopyFromScreen refuses the two together.
    const uint SRCCOPY = 0x00CC0020, CAPTUREBLT = 0x40000000;
    // Mouse buttons by the steps' numbers: left, right, middle.
    static readonly uint[] DOWN = { LEFTDOWN, RIGHTDOWN, MIDDLEDOWN };
    static readonly uint[] UP = { LEFTUP, RIGHTUP, MIDDLEUP };

    static void Send(params INPUT[] inputs)
    {
        if (inputs.Length == 0) return;
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != inputs.Length)
            throw new Exception("Windows did not take the input (a program running as administrator may be in front, or the screen is locked)");
    }

    static INPUT Mouse(uint flags, int data)
    {
        INPUT i = new INPUT();
        i.type = INPUT_MOUSE;
        i.u.mi.dwFlags = flags;
        i.u.mi.mouseData = unchecked((uint)data);
        return i;
    }

    // Keys the keyboard sends with the E0 prefix: arrows, the block above them, the Windows and menu keys, media keys.
    static bool Extended(int vk)
    {
        switch (vk)
        {
            case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: case 0x27: case 0x28:
            case 0x2C: case 0x2D: case 0x2E: case 0x5B: case 0x5C: case 0x5D: case 0x6F: case 0x90:
            case 0xA3: case 0xA5: case 0xAD: case 0xAE: case 0xAF: case 0xB0: case 0xB1: case 0xB2: case 0xB3:
                return true;
        }
        return false;
    }

    static INPUT Key(int vk, bool up)
    {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = (ushort)vk;
        i.u.ki.wScan = (ushort)MapVirtualKey((uint)vk, 0);
        i.u.ki.dwFlags = (Extended(vk) ? EXTENDEDKEY : 0) | (up ? KEYUP : 0);
        return i;
    }

    static INPUT Unit(char c, bool up)
    {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = 0;
        i.u.ki.wScan = c;
        i.u.ki.dwFlags = UNICODE | (up ? KEYUP : 0);
        return i;
    }

    static bool IsDown(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

    // ---- what the steps say ---------------------------------------------------------------------------------------

    static double Num(Dictionary<string, object> o, string k)
    {
        object v;
        return o.TryGetValue(k, out v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : 0;
    }

    static int Int(Dictionary<string, object> o, string k) { return (int)Math.Round(Num(o, k)); }

    static bool Given(Dictionary<string, object> o)
    {
        object x, y;
        return o.TryGetValue("x", out x) && x != null && o.TryGetValue("y", out y) && y != null;
    }

    static List<int> Ints(Dictionary<string, object> o, string k)
    {
        List<int> list = new List<int>();
        object v;
        if (o.TryGetValue(k, out v) && v is List<object>)
            foreach (object x in (List<object>)v) list.Add((int)Math.Round(Convert.ToDouble(x, CultureInfo.InvariantCulture)));
        return list;
    }

    // ---- the mouse ------------------------------------------------------------------------------------------------

    static void Place(double x, double y)
    {
        SetCursorPos((int)Math.Round(x), (int)Math.Round(y));
        // A move where the pointer is, so apps that read the mouse's own input see it move too.
        Send(Mouse(MOVE, 0));
    }

    static void MoveTo(double x, double y)
    {
        Place(x, y);
        Thread.Sleep(50);
    }

    static void Click(Dictionary<string, object> o)
    {
        if (Given(o)) MoveTo(Num(o, "x"), Num(o, "y"));
        List<int> mods = Ints(o, "mods");
        Press(mods);
        int b = Int(o, "button");
        if (b < 0 || b > 2) b = 0;
        int count = Math.Max(1, Int(o, "count"));
        for (int n = 1; n <= count; n++)
        {
            Send(Mouse(DOWN[b], 0));
            Thread.Sleep(20);
            Send(Mouse(UP[b], 0));
            if (n < count) Thread.Sleep(60);
        }
        Lift(mods);
    }

    static void Drag(Dictionary<string, object> o)
    {
        double x1 = Num(o, "x1"), y1 = Num(o, "y1"), x2 = Num(o, "x2"), y2 = Num(o, "y2");
        MoveTo(x1, y1);
        Send(Mouse(LEFTDOWN, 0));
        Thread.Sleep(80);
        for (int i = 1; i <= 12; i++)
        {
            Place(x1 + (x2 - x1) * i / 12.0, y1 + (y2 - y1) * i / 12.0);
            Thread.Sleep(16);
        }
        Thread.Sleep(50);
        Send(Mouse(LEFTUP, 0));
    }

    static void Scroll(Dictionary<string, object> o)
    {
        if (Given(o)) MoveTo(Num(o, "x"), Num(o, "y"));
        double dy = Num(o, "dy"), dx = Num(o, "dx");
        int n = Math.Max(1, Int(o, "n"));
        // A notch is 120: up and right are positive. The steps' dx is positive to the left.
        for (int i = 0; i < n; i++)
        {
            if (dy != 0) Send(Mouse(WHEEL, dy > 0 ? 120 : -120));
            else if (dx != 0) Send(Mouse(HWHEEL, dx > 0 ? -120 : 120));
            Thread.Sleep(30);
        }
    }

    // ---- the keyboard ---------------------------------------------------------------------------------------------

    static void Press(List<int> mods)
    {
        foreach (int m in mods) { Send(Key(m, false)); Thread.Sleep(10); }
    }

    static void Lift(List<int> mods)
    {
        for (int i = mods.Count - 1; i >= 0; i--) { Send(Key(mods[i], true)); Thread.Sleep(10); }
    }

    static void Stroke(Dictionary<string, object> o, int holdMs)
    {
        List<int> mods = Ints(o, "mods");
        int code = Int(o, "code");
        Press(mods);
        Send(Key(code, false));
        Thread.Sleep(holdMs > 0 ? holdMs : 20);
        Send(Key(code, true));
        Lift(mods);
    }

    static void TypeText(string text)
    {
        foreach (char c in text)
        {
            if (c == '\r') continue;
            if (c == '\n') Send(Key(0x0D, false), Key(0x0D, true));
            else if (c == '\t') Send(Key(0x09, false), Key(0x09, true));
            else Send(Unit(c, false), Unit(c, true));
            Thread.Sleep(5);
        }
    }

    // After a stop: no button or modifier left held down.
    static void Release()
    {
        if (IsDown(0x01)) Send(Mouse(LEFTUP, 0));
        if (IsDown(0x02)) Send(Mouse(RIGHTUP, 0));
        if (IsDown(0x04)) Send(Mouse(MIDDLEUP, 0));
        int[] mods = { 0x10, 0x11, 0x12, 0x5B, 0x5C };
        foreach (int m in mods) if (IsDown(m)) Send(Key(m, true));
    }

    // ---- where things are -----------------------------------------------------------------------------------------

    static Dictionary<string, object> Pointer()
    {
        POINT p;
        GetCursorPos(out p);
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["x"] = p.X;
        d["y"] = p.Y;
        return d;
    }

    static RECT Primary()
    {
        IntPtr m = MonitorFromPoint(new POINT(), 1);
        MONITORINFO mi = new MONITORINFO();
        mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (m != IntPtr.Zero && GetMonitorInfo(m, ref mi)) return mi.rcMonitor;
        RECT r = new RECT();
        r.Right = GetSystemMetrics(0);
        r.Bottom = GetSystemMetrics(1);
        return r;
    }

    static Dictionary<string, object> Info()
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["pos"] = Pointer();
        RECT r = Primary();
        Dictionary<string, object> display = new Dictionary<string, object>();
        display["x"] = r.Left;
        display["y"] = r.Top;
        display["w"] = r.Right - r.Left;
        display["h"] = r.Bottom - r.Top;
        d["display"] = display;
        d["displays"] = GetSystemMetrics(80);
        IntPtr front = GetForegroundWindow();
        if (front != IntPtr.Zero)
        {
            StringBuilder title = new StringBuilder(512);
            if (GetWindowText(front, title, title.Capacity) > 0) d["window"] = title.ToString();
            uint pid;
            GetWindowThreadProcessId(front, out pid);
            try
            {
                Process p = Process.GetProcessById((int)pid);
                string app = p.ProcessName;
                try
                {
                    string about = p.MainModule.FileVersionInfo.FileDescription;
                    if (!string.IsNullOrEmpty(about)) app = about.Trim();
                }
                catch (Exception) { }
                d["app"] = app;
            }
            catch (Exception) { }
        }
        return d;
    }

    // ---- the screen -----------------------------------------------------------------------------------------------

    static Dictionary<string, object> Shot(int max, int quality)
    {
        RECT r = Primary();
        int w = r.Right - r.Left, h = r.Bottom - r.Top;
        if (w <= 0 || h <= 0) throw new Exception("could not read the size of the main display");
        double s = Math.Min(1.0, (double)max / Math.Max(w, h));
        int tw = Math.Max(1, (int)Math.Round(w * s)), th = Math.Max(1, (int)Math.Round(h * s));
        byte[] jpeg;
        using (Bitmap full = new Bitmap(w, h, PixelFormat.Format24bppRgb))
        {
            // CAPTUREBLT takes in layered windows too (menus, tooltips); windows that keep out of captures stay out.
            using (Graphics g = Graphics.FromImage(full))
            {
                IntPtr dest = g.GetHdc();
                IntPtr screen = GetDC(IntPtr.Zero);
                try
                {
                    if (screen == IntPtr.Zero || !BitBlt(dest, 0, 0, w, h, screen, r.Left, r.Top, SRCCOPY | CAPTUREBLT))
                        throw new Exception("could not see the screen (is it locked, or showing a Windows security prompt?)");
                }
                finally
                {
                    if (screen != IntPtr.Zero) ReleaseDC(IntPtr.Zero, screen);
                    g.ReleaseHdc(dest);
                }
            }
            using (Bitmap small = new Bitmap(tw, th, PixelFormat.Format24bppRgb))
            {
                using (Graphics g = Graphics.FromImage(small))
                using (ImageAttributes edges = new ImageAttributes())
                {
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.CompositingQuality = CompositingQuality.HighQuality;
                    edges.SetWrapMode(WrapMode.TileFlipXY);
                    g.DrawImage(full, new Rectangle(0, 0, tw, th), 0, 0, w, h, GraphicsUnit.Pixel, edges);
                }
                jpeg = Jpeg(small, quality);
            }
        }
        Dictionary<string, object> d = Info();
        d["jpeg"] = Convert.ToBase64String(jpeg);
        d["width"] = tw;
        d["height"] = th;
        return d;
    }

    static byte[] Jpeg(Bitmap b, int quality)
    {
        ImageCodecInfo codec = null;
        foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if (c.FormatID == ImageFormat.Jpeg.Guid) codec = c;
        using (MemoryStream ms = new MemoryStream())
        {
            if (codec == null) b.Save(ms, ImageFormat.Jpeg);
            else
                using (EncoderParameters ps = new EncoderParameters(1))
                {
                    ps.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)Math.Max(1, Math.Min(100, quality)));
                    b.Save(ms, codec, ps);
                }
            return ms.ToArray();
        }
    }

    // ---- apps -----------------------------------------------------------------------------------------------------

    static object Call(object o, string method, params object[] args) { return o.GetType().InvokeMember(method, BindingFlags.InvokeMethod, null, o, args); }
    static object Get(object o, string property) { return o.GetType().InvokeMember(property, BindingFlags.GetProperty, null, o, null); }

    // Opens an app by its name as the Start menu shows it (Win32 and Store apps alike, from shell:AppsFolder), else a
    // program Windows finds by its name (App Paths, PATH). Returns the name of what it opened.
    static string Open(string name)
    {
        string wanted = (name ?? "").Trim();
        try
        {
            Type t = Type.GetTypeFromProgID("Shell.Application");
            object shell = Activator.CreateInstance(t);
            object folder = Call(shell, "NameSpace", "shell:AppsFolder");
            object items = Call(folder, "Items");
            int count = Convert.ToInt32(Get(items, "Count"));
            string best = null, bestName = null;
            int rank = 9;
            for (int i = 0; i < count && rank > 0; i++)
            {
                object item = Call(items, "Item", i);
                if (item == null) continue;
                string n = (Get(item, "Name") as string) ?? "";
                int r = string.Equals(n, wanted, StringComparison.OrdinalIgnoreCase) ? 0
                    : n.StartsWith(wanted, StringComparison.OrdinalIgnoreCase) ? 1
                    : n.IndexOf(wanted, StringComparison.OrdinalIgnoreCase) >= 0 ? 2 : 9;
                if (r < rank)
                {
                    rank = r;
                    best = Get(item, "Path") as string;
                    bestName = n;
                }
            }
            if (best != null)
            {
                Process.Start("explorer.exe", "\"shell:AppsFolder\\" + best + "\"");
                return bestName;
            }
        }
        catch (Exception) { }
        try
        {
            ProcessStartInfo start = new ProcessStartInfo(wanted);
            start.UseShellExecute = true;
            Process.Start(start);
            return wanted;
        }
        catch (Exception)
        {
            throw new Exception("there is no app called \"" + wanted + "\" on this PC: use its name as the Start menu shows it, like Notepad or Google Chrome");
        }
    }

    // ---- the requests ---------------------------------------------------------------------------------------------

    static Dictionary<string, object> Ops(List<object> ops)
    {
        Dictionary<string, object> output = new Dictionary<string, object>();
        List<object> positions = new List<object>();
        output["positions"] = positions;
        int done = 0;
        foreach (object item in ops)
        {
            Dictionary<string, object> o = (Dictionary<string, object>)item;
            string op = Convert.ToString(o["op"], CultureInfo.InvariantCulture);
            switch (op)
            {
                case "move": MoveTo(Num(o, "x"), Num(o, "y")); break;
                case "click": Click(o); break;
                case "drag": Drag(o); break;
                case "down": if (Given(o)) MoveTo(Num(o, "x"), Num(o, "y")); Send(Mouse(LEFTDOWN, 0)); break;
                case "up": if (Given(o)) { Place(Num(o, "x"), Num(o, "y")); Thread.Sleep(30); } Send(Mouse(LEFTUP, 0)); break;
                case "scroll": Scroll(o); break;
                case "type": TypeText(Convert.ToString(o["text"], CultureInfo.InvariantCulture)); output["typed"] = "unicode"; break;
                case "key": Stroke(o, 0); break;
                case "hold": Stroke(o, Math.Max(1, Int(o, "ms"))); break;
                case "sleep": Thread.Sleep(Math.Max(0, Int(o, "ms"))); break;
                case "pos": positions.Add(Pointer()); break;
                case "info": output["info"] = Info(); break;
                case "release": Release(); break;
                default: throw new Exception("unknown step: " + op);
            }
            done++;
        }
        output["done"] = done;
        return output;
    }

    public static void Main() { Run(); }

    public static void Run()
    {
        // Pixels of the screen, whatever its scaling (Windows 10 1607 and later; the whole process before that).
        try { SetThreadDpiAwarenessContext(new IntPtr(-4)); }
        catch (Exception) { try { SetProcessDPIAware(); } catch (Exception) { } }
        StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        StreamWriter output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        output.AutoFlush = true;
        output.WriteLine("{\"ready\":true}");
        string line;
        while ((line = input.ReadLine()) != null)
        {
            if (line.Trim().Length == 0) continue;
            Dictionary<string, object> reply = new Dictionary<string, object>();
            try
            {
                Dictionary<string, object> req = (Dictionary<string, object>)HydorJson.Parse(line);
                object id, v;
                req.TryGetValue("id", out id);
                reply["id"] = id;
                if (req.TryGetValue("ops", out v)) reply["out"] = Ops((List<object>)v);
                else if (req.TryGetValue("shot", out v))
                {
                    Dictionary<string, object> o = (Dictionary<string, object>)v;
                    reply["out"] = Shot(Int(o, "max"), Int(o, "quality"));
                }
                else if (req.TryGetValue("open", out v))
                {
                    Dictionary<string, object> opened = new Dictionary<string, object>();
                    opened["app"] = Open(Convert.ToString(v, CultureInfo.InvariantCulture));
                    reply["out"] = opened;
                }
                else throw new Exception("nothing was asked");
                reply["ok"] = true;
            }
            catch (Exception e)
            {
                Exception inner = e;
                while (inner is TargetInvocationException && inner.InnerException != null) inner = inner.InnerException;
                reply["ok"] = false;
                reply["error"] = inner.Message;
            }
            output.WriteLine(HydorJson.Stringify(reply));
        }
    }
}

// The little JSON the server and the helper say to each other: objects, lists, strings, numbers, true, false, null.
// Everything past ASCII goes out as \uXXXX, so no console code page can garble it.
public static class HydorJson
{
    public static object Parse(string text)
    {
        int i = 0;
        object v = Value(text, ref i);
        return v;
    }

    static void Space(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

    static void Expect(string s, ref int i, char c)
    {
        Space(s, ref i);
        if (i >= s.Length || s[i] != c) throw new Exception("bad JSON at " + i);
        i++;
    }

    static object Value(string s, ref int i)
    {
        Space(s, ref i);
        if (i >= s.Length) throw new Exception("bad JSON: it ends too soon");
        char c = s[i];
        if (c == '{')
        {
            i++;
            Dictionary<string, object> d = new Dictionary<string, object>();
            Space(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (true)
            {
                Space(s, ref i);
                string key = Str(s, ref i);
                Expect(s, ref i, ':');
                d[key] = Value(s, ref i);
                Space(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                Expect(s, ref i, '}');
                return d;
            }
        }
        if (c == '[')
        {
            i++;
            List<object> list = new List<object>();
            Space(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return list; }
            while (true)
            {
                list.Add(Value(s, ref i));
                Space(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                Expect(s, ref i, ']');
                return list;
            }
        }
        if (c == '"') return Str(s, ref i);
        if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
        if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
        if (string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
        int start = i;
        while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
        if (i == start) throw new Exception("bad JSON at " + i);
        return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
    }

    static string Str(string s, ref int i)
    {
        if (i >= s.Length || s[i] != '"') throw new Exception("bad JSON at " + i);
        i++;
        StringBuilder b = new StringBuilder();
        while (i < s.Length && s[i] != '"')
        {
            char c = s[i++];
            if (c != '\\') { b.Append(c); continue; }
            char e = s[i++];
            switch (e)
            {
                case 'n': b.Append('\n'); break;
                case 't': b.Append('\t'); break;
                case 'r': b.Append('\r'); break;
                case 'b': b.Append('\b'); break;
                case 'f': b.Append('\f'); break;
                case 'u': b.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                default: b.Append(e); break;
            }
        }
        i++;
        return b.ToString();
    }

    public static string Stringify(object v)
    {
        StringBuilder b = new StringBuilder();
        Write(b, v);
        return b.ToString();
    }

    static void Write(StringBuilder b, object v)
    {
        if (v == null) { b.Append("null"); return; }
        string s = v as string;
        if (s != null) { Quote(b, s); return; }
        if (v is bool) { b.Append((bool)v ? "true" : "false"); return; }
        IDictionary<string, object> d = v as IDictionary<string, object>;
        if (d != null)
        {
            b.Append('{');
            bool first = true;
            foreach (KeyValuePair<string, object> kv in d)
            {
                if (!first) b.Append(',');
                first = false;
                Quote(b, kv.Key);
                b.Append(':');
                Write(b, kv.Value);
            }
            b.Append('}');
            return;
        }
        IEnumerable list = v as IEnumerable;
        if (list != null)
        {
            b.Append('[');
            bool first = true;
            foreach (object x in list)
            {
                if (!first) b.Append(',');
                first = false;
                Write(b, x);
            }
            b.Append(']');
            return;
        }
        b.Append(Convert.ToString(v, CultureInfo.InvariantCulture));
    }

    static void Quote(StringBuilder b, string s)
    {
        b.Append('"');
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c < 0x20 || c > 0x7e) b.Append("\\u").Append(((int)c).ToString("x4"));
            else b.Append(c);
        }
        b.Append('"');
    }
}
