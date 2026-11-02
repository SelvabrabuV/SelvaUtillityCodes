Option Explicit

Dim fso, excel, workbook, folderPath, mainFolder, subFolder, file, sheet, row
Dim wsCount

' Create FileSystemObject for folder operations
Set fso = CreateObject("Scripting.FileSystemObject")

' Create Excel application
Set excel = CreateObject("Excel.Application")
excel.Visible = True ' Set to False to run in background
excel.DisplayAlerts = False ' Suppress alerts

' Create a new workbook
Set workbook = excel.Workbooks.Add()

' Prompt user for folder path
folderPath = InputBox("Enter the folder path to scan:", "Folder Path", "C:\Your\Folder\Path")
If folderPath = "" Then
    MsgBox "No folder path provided. Exiting.", 16, "Error"
    excel.Quit
    WScript.Quit
End If

' Check if folder exists
If Not fso.FolderExists(folderPath) Then
    MsgBox "Folder does not exist: " & folderPath, 16, "Error"
    excel.Quit
    WScript.Quit
End If

' Get the main folder
Set mainFolder = fso.GetFolder(folderPath)

' Initialize worksheet counter
wsCount = 0 ' Start at 0, we'll increment as we add sheets

' Iterate through subfolders
For Each subFolder In mainFolder.SubFolders
    ' Add a new worksheet
    wsCount = wsCount + 1
    Set sheet = workbook.Sheets.Add ' Add sheet at the end
    ' Set sheet name (truncate to 31 chars, Excel limit)
    sheet.Name = Left(subFolder.Name, 31)
    
    ' Add header
    sheet.Cells(1, 1).Value = "Filename"
    sheet.Cells(1, 1).Font.Bold = True
    
    ' Initialize row counter
    row = 2
    
    ' Iterate through files in subfolder, excluding "-meta.xml" files
    For Each file In subFolder.Files
        If InStr(file.Name, "-meta.xml") = 0 Then ' Exclude if "-meta.xml" is not found
            sheet.Cells(row, 1).Value = file.Name
            row = row + 1
        End If
    Next
    
    ' Auto-fit column
    sheet.Columns(1).AutoFit
Next

' Delete default sheets if more than needed (new workbooks typically have 1-3 sheets)
Do While workbook.Sheets.Count > wsCount
    workbook.Sheets(workbook.Sheets.Count).Delete
Loop

' Save the workbook in the main folder
workbook.SaveAs fso.BuildPath(folderPath, "FolderStructure.xlsx")
workbook.Close
excel.Quit

' Clean up and check objects before use
If Not fso Is Nothing Then
    MsgBox "Excel file created successfully at: " & fso.BuildPath(folderPath, "FolderStructure.xlsx"), 64, "Success"
End If

' Clean up
Set sheet = Nothing
Set workbook = Nothing
Set excel = Nothing
Set fso = Nothing