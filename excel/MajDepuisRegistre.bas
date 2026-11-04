Attribute VB_Name = "MajDepuisRegistre"
'==============================================================================
' MajDepuisRegistre - met a jour IMMO-COORDI-DISSIM.xlsm depuis le Registre GCBLO
'
' Lit le fichier registre-gcblo.csv ecrit par le Registre a chaque sauvegarde
' (manuelle ou automatique toutes les 3 h), puis, sur les onglets 33, 16, 17, 79, 86,
' pour chaque ligne dont la colonne D est un GCBLO du registre
' et dont la colonne E vaut "GCBLO" (ou deja "FACTU") :
'   - colonne J : "Numéro de commande FCI : <fci>" tenu a jour depuis le registre
'       * registre sans FCI          -> la cellule n'est pas touchee
'       * un FCI du registre est deja quelque part dans J -> pas touchee
'         (plusieurs lignes, plusieurs FCI : chaque ligne garde le sien)
'       * sinon : le texte apres "Numéro de commande FCI :" est remplace,
'         ou la mention est ajoutee a la fin si elle n'existe pas ;
'         le reste du texte de J est garde
'   - colonne E : "FACTU" pour les dossiers en Attach dans le registre
'
' Rien n'est efface. Les cas laisses de cote (cellule protegee, formule...) sont signales.
' A la fin, une fenetre "Compte rendu" montre ce qui a ete fait
' (vert = modifie, orange = laisse de cote, lien "voir" vers la cellule).
' Classeur temporaire jamais enregistre : il se ferme sans question.
'
' Dans l'autre sens, la macro ecrit classeur-gcblo.csv dans le meme dossier : les lignes
' "GCBLO" du classeur ouvert (meme non enregistre). A chaque sauvegarde, le registre le lit
' et cree les nouveaux GCBLO (ou complete ce qui manque), comme la commande import.
'
' Relancer la macro ne change rien de plus : un FCI deja present et un "FACTU"
' deja pose ne sont pas reecrits ("Tout est deja a jour").
'
' Lancer : Alt+F8 > MajDepuisRegistre. La premiere fois, la macro demande ou se
' trouve registre-gcblo.csv ; le chemin est garde sur ce PC (pas dans le classeur).
' ChoisirCsvRegistre permet d'en changer.
'==============================================================================
Option Explicit

Private Const ONGLETS As String = "33,16,17,79,86"
Private Const COL_DOSSIER As String = "D"
Private Const COL_FILTRE As String = "E"
Private Const COL_FCI As String = "J"
Private Const PREMIERE_LIGNE As Long = 2
Private Const APPLI As String = "RegistreGCBLO"
Private Const NOM_CSV_CLASSEUR As String = "classeur-gcblo.csv"
Private Const TITRE As String = "Mise a jour depuis le registre"

Private nbModifs As Long
Private nbIgnores As Long
Private cible As Workbook           ' le classeur a mettre a jour (IMMO-COORDI-DISSIM)
Private faits As Collection          ' ce que la macro a fait, pour la fenetre de compte rendu

' Textes avec accents, construits ici pour ne pas dependre de l'encodage du module
Private Function Factu() As String
    Factu = "FACTU"
End Function

Private Function MentionFci() As String
    MentionFci = "Num" & ChrW(233) & "ro de commande FCI : "
End Function

'------------------------------------------------------------------------------
Public Sub MajDepuisRegistre()
    Dim chemin As String, registre As Object, nomOnglet As Variant
    Dim ws As Worksheet, derniere As Long, i As Long
    Dim cle As String, filtre As String, info As Variant
    Dim ancienJ As String, nouveauJ As String, vus As Long, absents As String, exportees As String

    Set cible = ClasseurCible()
    If cible Is Nothing Then
        MsgBox "Classeur IMMO-COORDI-DISSIM introuvable : ouvrez-le dans Excel (application de bureau), puis relancez la macro.", vbExclamation, TITRE
        Exit Sub
    End If

    chemin = CheminCsv()
    If chemin = "" Then
        MsgBox "Aucun fichier choisi : rien n'a " & ChrW(233) & "t" & ChrW(233) & " fait." & vbCrLf & vbCrLf & _
               "Le fichier registre-gcblo.csv est " & ChrW(233) & "crit par le registre " & ChrW(224) & " chaque sauvegarde, " & _
               "dans le dossier des sauvegardes. S'il n'y est pas, tapez sauvegarde dans le registre " & _
               "(apr" & ChrW(232) & "s Ctrl+F5 pour avoir la derni" & ChrW(232) & "re version de la page).", vbExclamation, TITRE
        Exit Sub
    End If

    Set registre = LireRegistre(chemin)
    If registre Is Nothing Then Exit Sub

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    On Error GoTo Fin

    nbModifs = 0: nbIgnores = 0
    Set faits = New Collection

    For Each nomOnglet In Split(ONGLETS, ",")
        Set ws = Nothing
        On Error Resume Next
        Set ws = cible.Worksheets(Trim$(nomOnglet))
        On Error GoTo Fin
        If ws Is Nothing Then
            absents = absents & " " & Trim$(nomOnglet)
        Else
            derniere = ws.Cells(ws.Rows.Count, COL_DOSSIER).End(xlUp).Row
            For i = PREMIERE_LIGNE To derniere
                cle = NormaliserGcblo(CStr(ws.Cells(i, COL_DOSSIER).Value))
                If cle <> "" Then
                    If registre.Exists(cle) Then
                        filtre = UCase$(Trim$(CStr(ws.Cells(i, COL_FILTRE).Value)))
                        If filtre = "GCBLO" Or filtre = Factu() Then
                            vus = vus + 1
                            info = registre(cle)          ' (0) = FCI, (1) = code statut

                            ' --- Colonne J : le FCI
                            If info(0) <> "" Then
                                ancienJ = CStr(ws.Cells(i, COL_FCI).Value)
                                nouveauJ = TexteFci(ancienJ, CStr(info(0)))
                                If nouveauJ <> ancienJ Then Ecrire ws, i, COL_FCI, cle, ancienJ, nouveauJ
                            End If

                            ' --- Colonne E : FACTU pour les dossiers Attach
                            If info(1) = "ATTACH" And filtre = "GCBLO" Then
                                Ecrire ws, i, COL_FILTRE, cle, CStr(ws.Cells(i, COL_FILTRE).Value), Factu()
                            End If
                        End If
                    End If
                End If
            Next i
        End If
    Next nomOnglet

    ' --- Dans l'autre sens : les lignes GCBLO du classeur ouvert, pour le registre
    exportees = ExporterClasseur(Left$(chemin, InStrRev(chemin, "\")) & NOM_CSV_CLASSEUR)

Fin:
    Dim erreur As String
    If Err.Number <> 0 Then erreur = vbCrLf & vbCrLf & "Arr" & ChrW(234) & "t sur erreur : " & Err.Description
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    Dim bilan As String
    bilan = registre.Count & " dossiers dans le registre  " & ChrW(183) & "  " & vus & " lignes concern" & ChrW(233) & "es  " & ChrW(183) & "  " & _
             nbModifs & " cellule(s) modifi" & ChrW(233) & "e(s)  " & ChrW(183) & "  " & nbIgnores & " laiss" & ChrW(233) & "e(s) de c" & ChrW(244) & "t" & ChrW(233) & _
             IIf(absents <> "", "  " & ChrW(183) & "  onglets introuvables :" & absents, "") & _
             IIf(exportees <> "", "  " & ChrW(183) & "  " & exportees, "")

    If nbModifs + nbIgnores = 0 And erreur = "" Then
        MsgBox "Tout est d" & ChrW(233) & "j" & ChrW(224) & " " & ChrW(224) & " jour." & vbCrLf & vbCrLf & Replace(bilan, "  " & ChrW(183) & "  ", vbCrLf), _
               vbInformation, TITRE
    Else
        If Not CompteRendu(bilan, erreur) Then
            MsgBox Replace(bilan, "  " & ChrW(183) & "  ", vbCrLf) & erreur, vbInformation, TITRE
        End If
    End If
End Sub

'------------------------------------------------------------------------------
' Ecrit classeur-gcblo.csv a cote de registre-gcblo.csv : les lignes dont E vaut "GCBLO"
' sur les onglets 33, 16, 17, 79, 86, lues dans le classeur OUVERT (meme non enregistre).
' Le registre le lit a chaque sauvegarde et y prend les nouveaux GCBLO (comme "import").
' Renvoie une phrase pour le bilan.
Private Function ExporterClasseur(destination As String) As String
    Dim ws As Worksheet, nomOnglet As Variant, derniere As Long, i As Long, n As Long
    Dim lignes() As String, flux As Object

    ReDim lignes(0 To 255)
    lignes(0) = "ONGLET;LIGNE;DOSSIER;COLONNE E;AFFECT;COMMUNE;VALO;COLONNE J"
    For Each nomOnglet In Split(ONGLETS, ",")
        Set ws = Nothing
        On Error Resume Next
        Set ws = cible.Worksheets(Trim$(nomOnglet))
        On Error GoTo 0
        If Not ws Is Nothing Then
            derniere = ws.Cells(ws.Rows.Count, COL_DOSSIER).End(xlUp).Row
            For i = PREMIERE_LIGNE To derniere
                If UCase$(Trim$(Cellule(ws, i, COL_FILTRE))) = "GCBLO" And Trim$(Cellule(ws, i, COL_DOSSIER)) <> "" Then
                    n = n + 1
                    If n > UBound(lignes) Then ReDim Preserve lignes(0 To 2 * n)
                    lignes(n) = Trim$(nomOnglet) & ";" & i & ";" & Cellule(ws, i, COL_DOSSIER) & ";" & _
                                Cellule(ws, i, COL_FILTRE) & ";" & Cellule(ws, i, "I") & ";" & Cellule(ws, i, "G") & ";" & _
                                Cellule(ws, i, "H") & ";" & Cellule(ws, i, COL_FCI)
                End If
            Next i
        End If
    Next nomOnglet

    On Error GoTo Echec
    Set flux = CreateObject("ADODB.Stream")
    flux.Type = 2: flux.Charset = "utf-8": flux.Open
    ReDim Preserve lignes(0 To n)
    flux.WriteText Join(lignes, vbCrLf) & vbCrLf
    flux.SaveToFile destination, 2                 ' 2 = remplace le fichier
    flux.Close
    ExporterClasseur = n & " ligne(s) GCBLO envoy" & ChrW(233) & "e(s) au registre (" & NOM_CSV_CLASSEUR & ")"
    Exit Function
Echec:
    ExporterClasseur = NOM_CSV_CLASSEUR & " non " & ChrW(233) & "crit : " & Err.Description
End Function

' Valeur d'une cellule en texte, sans ";" ni retour a la ligne (une erreur #N/A donne "")
Private Function Cellule(ws As Worksheet, ligne As Long, colonne As String) As String
    Dim v As Variant
    v = ws.Cells(ligne, colonne).Value
    If IsError(v) Then Exit Function
    Cellule = Trim$(Replace(Replace(Replace(CStr(v), ";", " "), vbCr, " "), vbLf, " "))
End Function

'------------------------------------------------------------------------------
' Le classeur a mettre a jour : celui qui contient la macro s'il a l'onglet 33,
' sinon un classeur ouvert dont le nom commence par IMMO-COORDI-DISSIM,
' sinon le classeur actif s'il a l'onglet 33.
Private Function ClasseurCible() As Workbook
    Dim wb As Workbook
    If AOnglet(ThisWorkbook, "33") Then Set ClasseurCible = ThisWorkbook: Exit Function
    For Each wb In Application.Workbooks
        If UCase$(wb.Name) Like "IMMO-COORDI-DISSIM*" Then Set ClasseurCible = wb: Exit Function
    Next wb
    If Not ActiveWorkbook Is Nothing Then
        If AOnglet(ActiveWorkbook, "33") Then Set ClasseurCible = ActiveWorkbook
    End If
End Function

Private Function AOnglet(wb As Workbook, nom As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets(nom)
    AOnglet = Not ws Is Nothing
End Function

'------------------------------------------------------------------------------
' Nouveau texte de J. Garde le texte autour de la mention "Numéro de commande FCI :".
Private Function TexteFci(ByVal ancien As String, ByVal fciRegistre As String) As String
    Dim re As Object, m As Object, f As Variant

    ' Un FCI du registre est deja quelque part dans J : on n'y touche pas
    For Each f In Split(fciRegistre, " ")
        If f <> "" Then
            If InStr(1, ancien, f, vbTextCompare) > 0 Then TexteFci = ancien: Exit Function
        End If
    Next f

    Set re = CreateObject("VBScript.RegExp")
    re.IgnoreCase = True
    re.Pattern = "Num[e" & ChrW(233) & "]ro\s+de\s+commande\s+FCI\s*:\s*([^\s,;]*)"

    If re.Test(ancien) Then
        Set m = re.Execute(ancien)(0)
        TexteFci = Left$(ancien, m.FirstIndex) & MentionFci() & fciRegistre & Mid$(ancien, m.FirstIndex + m.Length + 1)
    ElseIf Trim$(ancien) = "" Then
        TexteFci = MentionFci() & fciRegistre
    Else
        TexteFci = ancien & " " & MentionFci() & fciRegistre
    End If
End Function

'------------------------------------------------------------------------------
Private Sub Ecrire(ws As Worksheet, ligne As Long, colonne As String, gcblo As String, _
                   avant As String, apres As String)
    Dim c As Range
    Set c = ws.Cells(ligne, colonne)
    If c.HasFormula Then
        Noter ws, ligne, gcblo, colonne, avant, apres, "Non modifi" & ChrW(233) & " : la cellule contient une formule"
        nbIgnores = nbIgnores + 1
        Exit Sub
    End If
    On Error Resume Next
    c.Value = apres
    If Err.Number <> 0 Then
        Noter ws, ligne, gcblo, colonne, avant, apres, "Non modifi" & ChrW(233) & " : " & Err.Description
        nbIgnores = nbIgnores + 1
        Err.Clear
    Else
        Noter ws, ligne, gcblo, colonne, avant, apres, ""
        nbModifs = nbModifs + 1
    End If
    On Error GoTo 0
End Sub

Private Sub Noter(ws As Worksheet, ligne As Long, gcblo As String, colonne As String, _
                  avant As String, apres As String, remarque As String)
    faits.Add Array(ws.Name, ligne, gcblo, colonne, avant, apres, remarque)
End Sub

'------------------------------------------------------------------------------
' Compte rendu dans une fenetre a part : un classeur temporaire, jamais enregistre,
' qui se ferme sans question. Le classeur partage n'est pas touche.
Private Function CompteRendu(bilan As String, erreur As String) As Boolean
    Dim wb As Workbook, ws As Worksheet, f As Variant, r As Long, n As Long
    Dim vert As Long, orange As Long, quoi As String

    On Error Resume Next
    Application.ScreenUpdating = False
    Set wb = Workbooks.Add(xlWBATWorksheet)
    If wb Is Nothing Then Application.ScreenUpdating = True: Exit Function
    Set ws = wb.Worksheets(1)
    ws.Name = "Compte rendu"
    ActiveWindow.DisplayGridlines = False
    ActiveWindow.Caption = "Compte rendu " & ChrW(8212) & " mise " & ChrW(224) & " jour depuis le registre"

    vert = RGB(226, 239, 218): orange = RGB(252, 228, 214)

    With ws.Range("A1")
        .Value = "Mise " & ChrW(224) & " jour de " & cible.Name & " depuis le registre GCBLO"
        .Font.Bold = True: .Font.Size = 14
    End With
    ws.Range("A2").Value = Format(Now, "dddd d mmmm yyyy") & " " & ChrW(224) & " " & Format(Now, "hh:mm")
    ws.Range("A2").Font.Color = RGB(110, 110, 110)
    ws.Range("A3").Value = bilan
    If erreur <> "" Then
        ws.Range("A4").Value = Trim$(Replace(erreur, vbCrLf, ""))
        ws.Range("A4").Font.Color = RGB(192, 0, 0): ws.Range("A4").Font.Bold = True
    End If

    r = 6
    ws.Range(ws.Cells(r, 1), ws.Cells(r, 8)).Value = Array("Onglet", "Ligne", "GCBLO", "Changement", "Avant", "Apr" & ChrW(232) & "s", "R" & ChrW(233) & "sultat", "Aller")
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 8))
        .Font.Bold = True: .Interior.Color = RGB(64, 64, 64): .Font.Color = RGB(255, 255, 255)
    End With

    For Each f In faits
        r = r + 1: n = n + 1
        If f(3) = COL_FCI Then quoi = "J " & ChrW(183) & " FCI" Else quoi = "E " & ChrW(183) & " " & Factu()
        ws.Cells(r, 1).Value = "'" & f(0)
        ws.Cells(r, 2).Value = f(1)
        ws.Cells(r, 3).Value = f(2)
        ws.Cells(r, 4).Value = quoi
        ws.Cells(r, 5).Value = "'" & f(4)
        ws.Cells(r, 6).Value = "'" & f(5)
        If f(6) = "" Then
            ws.Cells(r, 7).Value = "Modifi" & ChrW(233)
            ws.Range(ws.Cells(r, 1), ws.Cells(r, 8)).Interior.Color = vert
        Else
            ws.Cells(r, 7).Value = f(6)
            ws.Range(ws.Cells(r, 1), ws.Cells(r, 8)).Interior.Color = orange
        End If
        ' Lien vers la cellule dans le classeur partage
        ws.Hyperlinks.Add Anchor:=ws.Cells(r, 8), Address:=cible.FullName, _
            SubAddress:="'" & f(0) & "'!" & f(3) & f(1), TextToDisplay:="voir"
    Next f

    ws.Range("A6").AutoFilter
    ws.Columns("A:D").AutoFit
    ws.Columns("E:F").ColumnWidth = 45
    ws.Columns("G").ColumnWidth = 40
    ws.Columns("H").ColumnWidth = 7
    ws.Range(ws.Cells(7, 5), ws.Cells(r, 7)).WrapText = True
    ws.Range(ws.Cells(6, 1), ws.Cells(r, 8)).VerticalAlignment = xlTop
    ws.Range("A7").Select
    ActiveWindow.FreezePanes = True
    ws.Range("A1").Select

    wb.Saved = True                  ' se ferme sans demander d'enregistrer
    Application.ScreenUpdating = True
    wb.Activate
    CompteRendu = True
End Function


'------------------------------------------------------------------------------
' Lit registre-gcblo.csv (UTF-8, separateur ;). Colonnes reperees par leur en-tete.
' Renvoie un dictionnaire : GCBLO -> Array(FCI separes par un espace, code statut)
Private Function LireRegistre(chemin As String) As Object
    Dim flux As Object, texte As String, lignes() As String, entetes() As String, champs() As String
    Dim iGcblo As Long, iFci As Long, iStatut As Long, i As Long, k As Long, d As Object, cle As String

    On Error GoTo Echec
    Set flux = CreateObject("ADODB.Stream")
    flux.Type = 2: flux.Charset = "utf-8": flux.Open
    flux.LoadFromFile chemin
    texte = flux.ReadText: flux.Close
    On Error GoTo 0

    texte = Replace(texte, ChrW(&HFEFF), "")
    texte = Replace(texte, vbCrLf, vbLf)
    lignes = Split(texte, vbLf)
    If UBound(lignes) < 0 Then GoTo MauvaisFormat

    iGcblo = -1: iFci = -1: iStatut = -1
    entetes = Split(lignes(0), ";")
    For k = 0 To UBound(entetes)
        Select Case UCase$(Trim$(entetes(k)))
            Case "GCBLO": iGcblo = k
            Case "FCI": iFci = k
            Case "CODE STATUT": iStatut = k
        End Select
    Next k
    If iGcblo < 0 Or iFci < 0 Or iStatut < 0 Then GoTo MauvaisFormat

    Set d = CreateObject("Scripting.Dictionary")
    For i = 1 To UBound(lignes)
        If Trim$(lignes(i)) <> "" Then
            champs = Split(lignes(i), ";")
            If UBound(champs) >= Application.Max(iGcblo, iFci, iStatut) Then
                cle = NormaliserGcblo(champs(iGcblo))
                If cle <> "" Then d(cle) = Array(Application.Trim(champs(iFci)), UCase$(Trim$(champs(iStatut))))
            End If
        End If
    Next i
    Set LireRegistre = d
    Exit Function

MauvaisFormat:
    MsgBox "Ce fichier n'est pas un registre-gcblo.csv (en-t" & ChrW(234) & "tes GCBLO, FCI, CODE STATUT attendus) :" & vbCrLf & chemin, vbExclamation, TITRE
    Exit Function
Echec:
    MsgBox "Lecture impossible :" & vbCrLf & chemin & vbCrLf & Err.Description, vbExclamation, TITRE
End Function

Private Function NormaliserGcblo(ByVal s As String) As String
    s = UCase$(s)
    s = Replace(s, ChrW(8209), "-"): s = Replace(s, ChrW(8211), "-"): s = Replace(s, ChrW(8212), "-")
    s = Replace(s, " ", ""): s = Replace(s, ChrW(160), "")
    s = Replace(s, vbTab, ""): s = Replace(s, vbLf, ""): s = Replace(s, vbCr, "")
    NormaliserGcblo = s
End Function

'------------------------------------------------------------------------------
' Chemin du CSV : garde sur ce PC (registre Windows de l'utilisateur), pas dans le classeur partage.
Private Function CheminCsv() As String
    Dim c As String
    c = GetSetting(APPLI, "Macro", "CheminCSV", "")
    If c <> "" Then
        If Dir(c) <> "" Then CheminCsv = c: Exit Function
    End If
    CheminCsv = ChoisirCsv()
End Function

Public Sub ChoisirCsvRegistre()
    ChoisirCsv
End Sub

Private Function ChoisirCsv() As String
    With Application.FileDialog(msoFileDialogFilePicker)
        .Title = "O" & ChrW(249) & " est registre-gcblo.csv ? (dossier des sauvegardes du registre)"
        .AllowMultiSelect = False
        .Filters.Clear
        .Filters.Add "Registre GCBLO", "*.csv"
        If .Show = -1 Then
            ChoisirCsv = .SelectedItems(1)
            SaveSetting APPLI, "Macro", "CheminCSV", ChoisirCsv
        End If
    End With
End Function
