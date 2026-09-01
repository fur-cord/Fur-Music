Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

WshShell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

' ==========================================
' SETTINGS
' Change to True to automatically delete all downloaded music on startup
Const CLEAR_CACHE_ON_STARTUP = False
' ==========================================

If CLEAR_CACHE_ON_STARTUP Then
    On Error Resume Next
    fso.DeleteFile "audio\*.*", True
    On Error GoTo 0
End If

WshShell.Run "cmd /c pip install -r requirements.txt -q", 0, True

If Not fso.FolderExists(".git") Then
    WshShell.Run "cmd /c git init && git remote add origin https://github.com/katt-dev/Katt-Music.git && git branch -M main", 0, True
End If

' Back up .env before resetting
If fso.FileExists(".env") Then
    fso.CopyFile ".env", ".env.backup", True
End If

WshShell.Run "cmd /c git fetch origin main && git reset --hard origin/main", 0, True

' Restore .env after resetting
If fso.FileExists(".env.backup") Then
    fso.CopyFile ".env.backup", ".env", True
    fso.DeleteFile ".env.backup"
End If

WshShell.Run "cmd /c python app.py", 0, False

WScript.Sleep 3000

WshShell.Run "http://localhost:8000"
