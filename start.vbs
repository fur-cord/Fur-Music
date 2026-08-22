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

WshShell.Run "cmd /c git pull origin main", 0, True

WshShell.Run "cmd /c python app.py", 0, False

WScript.Sleep 3000

WshShell.Run "http://localhost:8000"
