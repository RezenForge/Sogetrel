Attribute VB_Name = "RegistreGcbloMails"
'==============================================================================
' LireFciMails - macro OUTLOOK (classique) du Registre GCBLO : les FCI recus par mail
'
' Cherche dans la Boite de reception (et ses sous-dossiers, et celles des boites partagees
' ouvertes dans Outlook) les mails des JOURS derniers jours dont l'objet contient
' "GCBLO | <GCBLO>" (les reponses a l'affectation et aux relances : "RE: GCBLO | SBA300497-THF010 | NUM21").
' Dans le texte du mail, hors partie citee (apres "De :", "From:", "-----", "_____"), un FCI
' (F + 11 chiffres) est retenu. Mails envoyes par vous-meme : ignores.
' Resultat : mails-gcblo.csv dans le dossier du registre (celui de registre-gcblo.csv),
' remplace a chaque fois : une ligne par GCBLO (le mail le plus recent).
' Le registre le lit toutes les minutes : un dossier sans FCI recoit le FCI du mail
' (historique : "FCI recu par mail de ..."). Un autre FCI deja connu : signale, rien change.
'
' Installer (une fois) : dans Outlook, Alt+F11, Fichier > Importer un fichier...,
' choisir LireFciMails.bas, puis Fichier > Enregistrer.
' Lancer a la main : Alt+F8 > LireFciMails.
'
' Automatique (conseille) : dans l'editeur (Alt+F11), double-clic sur "ThisOutlookSession"
' (dans Projet1 > Microsoft Outlook Objets), coller ces lignes, enregistrer, redemarrer Outlook :
'
'   Private Sub Application_Startup()
'       LireFciMailsSilencieux
'   End Sub
'   Private Sub Application_NewMailEx(ByVal EntryIDCollection As String)
'       NouveauxMails EntryIDCollection
'   End Sub
'
' Chaque mail recu dont l'objet contient GCBLO relance alors la recherche, sans fenetre.
'
' Le dossier du registre : repris de la macro Excel MajDepuisRegistre si elle l'a deja
' (meme PC), sinon demande une fois. ChoisirDossierRegistre pour en changer.
'==============================================================================
Option Explicit

Private Const APPLI As String = "RegistreGCBLO"
Private Const NOM_CSV As String = "mails-gcblo.csv"
Private Const TITRE As String = "FCI recus par mail"
Private Const JOURS As Long = 60

'------------------------------------------------------------------------------
Public Sub LireFciMails()
    Chercher True
End Sub

Public Sub LireFciMailsSilencieux()
    On Error Resume Next
    Chercher False
End Sub

' Pour ThisOutlookSession (Application_NewMailEx) : relance si un des nouveaux mails parle d'un GCBLO
Public Sub NouveauxMails(ByVal ids As String)
    Dim id As Variant, it As Object
    On Error Resume Next
    For Each id In Split(ids, ",")
        Set it = Nothing
        Set it = Application.Session.GetItemFromID(Trim$(id))
        If Not it Is Nothing Then
            If InStr(1, it.Subject, "GCBLO", vbTextCompare) > 0 Then
                Chercher False
                Exit Sub
            End If
        End If
    Next id
End Sub

Public Sub ChoisirDossierRegistre()
    Dim d As String
    d = DossierRegistre(True)
    If d <> "" Then MsgBox "Dossier du registre : " & d, vbInformation, TITRE
End Sub

'------------------------------------------------------------------------------
Private Sub Chercher(afficher As Boolean)
    Dim dossier As String, trouves As Object, boite As Object, reception As Object
    Dim lignes As String, cle As Variant, n As Long

    dossier = DossierRegistre(False)
    If dossier = "" Then
        If afficher Then MsgBox "Aucun dossier choisi : rien n'a " & ChrW(233) & "t" & ChrW(233) & " fait.", vbExclamation, TITRE
        Exit Sub
    End If

    Set trouves = CreateObject("Scripting.Dictionary")      ' GCBLO -> Array(recu, ligne)
    For Each boite In Application.Session.Stores
        Set reception = Nothing
        On Error Resume Next
        Set reception = boite.GetDefaultFolder(6)           ' olFolderInbox
        On Error GoTo 0
        If Not reception Is Nothing Then Parcourir reception, trouves
    Next boite

    lignes = "GCBLO;FCI;RECU LE;DE;OBJET" & vbCrLf
    For Each cle In trouves.Keys
        Dim v As Variant
        v = trouves.Item(cle)
        lignes = lignes & v(1) & vbCrLf
        n = n + 1
    Next cle
    EcrireUtf8 dossier & "\" & NOM_CSV, lignes

    If afficher Then
        MsgBox n & " GCBLO avec un FCI dans un mail (" & JOURS & " derniers jours)." & vbCrLf & _
               "Le registre les prend dans la minute (dossiers sans FCI)." & vbCrLf & vbCrLf & _
               "(" & dossier & "\" & NOM_CSV & ")", vbInformation, TITRE
    End If
End Sub

Private Sub Parcourir(dossier As Object, trouves As Object)
    Dim liste As Object, it As Object, sous As Object, limite As Date
    Dim gcblo As String, fci As String, ligne As String, ok As Boolean, plusRecent As Boolean, avant As Variant

    On Error Resume Next
    limite = Now - JOURS
    Set liste = Nothing
    Set liste = dossier.Items.Restrict("@SQL=""urn:schemas:httpmail:subject"" LIKE '%GCBLO%'")
    If Not liste Is Nothing Then
        For Each it In liste
            ' Sous "On Error Resume Next", une erreur dans un If entre dans le Then :
            ' on calcule dans une variable qui reste False en cas d'erreur.
            ok = False
            ok = (it.Class = 43)                            ' olMail
            If ok Then ok = (it.ReceivedTime >= limite)
            If ok Then ok = (it.SenderName <> Application.Session.CurrentUser.Name)
            If ok Then
                gcblo = "": fci = ""
                gcblo = GcbloDeLObjet(it.Subject)
                If gcblo <> "" Then fci = FciDuTexte(SansCitation(it.Body))
                If gcblo <> "" And fci <> "" Then
                    ligne = gcblo & ";" & fci & ";" & Format(it.ReceivedTime, "dd/mm/yyyy hh:nn") & ";" & _
                            Propre(it.SenderName) & ";" & Propre(it.Subject)
                    ' Le mail le plus recent l'emporte
                    plusRecent = True
                    If trouves.Exists(gcblo) Then
                        avant = trouves.Item(gcblo)
                        plusRecent = (it.ReceivedTime > avant(0))
                    End If
                    If plusRecent Then trouves.Item(gcblo) = Array(it.ReceivedTime, ligne)
                End If
            End If
        Next it
    End If
    For Each sous In dossier.Folders
        Parcourir sous, trouves
    Next sous
End Sub

'------------------------------------------------------------------------------
' "RE: GCBLO | SBA300497-THF010 | NUM21" -> "SBA300497-THF010"
Private Function GcbloDeLObjet(objet As String) As String
    Dim re As Object, m As Object
    Set re = CreateObject("VBScript.RegExp")
    re.IgnoreCase = True
    re.Pattern = "GCBLO\s*\|\s*([A-Z]{3}\d{6})\s*-\s*([A-Z]+\d+)"
    If re.Test(objet) Then
        Set m = re.Execute(objet)(0)
        GcbloDeLObjet = UCase$(m.SubMatches(0) & "-" & m.SubMatches(1))
    End If
End Function

' Les FCI (F + 11 chiffres) du texte, separes par un espace, sans doublon
Private Function FciDuTexte(texte As String) As String
    Dim re As Object, m As Object, f As String, r As String
    Set re = CreateObject("VBScript.RegExp")
    re.IgnoreCase = True: re.Global = True
    re.Pattern = "\bF\d{11}\b"
    For Each m In re.Execute(texte)
        f = UCase$(m.Value)
        If InStr(r, f) = 0 Then r = Trim$(r & " " & f)
    Next m
    FciDuTexte = r
End Function

' Le texte du mail sans la partie citee (le mail auquel on repond)
Private Function SansCitation(texte As String) As String
    Dim marque As Variant, p As Long, fin As Long
    fin = Len(texte) + 1
    For Each marque In Array(vbLf & "De :", vbLf & "De:", vbLf & "From:", vbLf & "-----", vbLf & "_____", vbLf & "Envoy" & ChrW(233) & " :")
        p = InStr(1, texte, marque, vbTextCompare)
        If p > 0 And p < fin Then fin = p
    Next marque
    SansCitation = Left$(texte, fin - 1)
End Function

Private Function Propre(ByVal s As String) As String
    Propre = Trim$(Replace(Replace(Replace(s, ";", ","), vbCr, " "), vbLf, " "))
End Function

'------------------------------------------------------------------------------
' Le dossier du registre (ou registre-gcblo.csv est ecrit) : celui de la macro Excel, sinon demande.
Private Function DossierRegistre(changer As Boolean) As String
    Dim d As String, explorateur As Object, choix As Object
    If Not changer Then
        d = GetSetting(APPLI, "Outlook", "DossierRegistre", "")
        If d = "" Then
            d = GetSetting(APPLI, "Macro", "CheminCSV", "")            ' macro Excel, meme PC
            If d <> "" Then d = Left$(d, InStrRev(d, "\") - 1)
        End If
        If d <> "" Then
            If Dir(d, vbDirectory) <> "" Then DossierRegistre = d: Exit Function
        End If
    End If
    Set explorateur = CreateObject("Shell.Application")
    Set choix = explorateur.BrowseForFolder(0, "Dossier du registre GCBLO (celui des sauvegardes, o" & ChrW(249) & " est registre-gcblo.csv)", 0)
    If choix Is Nothing Then Exit Function
    d = choix.Self.Path
    If Right$(d, 1) = "\" Then d = Left$(d, Len(d) - 1)
    SaveSetting APPLI, "Outlook", "DossierRegistre", d
    DossierRegistre = d
End Function

Private Sub EcrireUtf8(chemin As String, texte As String)
    Dim flux As Object
    Set flux = CreateObject("ADODB.Stream")
    flux.Type = 2: flux.Charset = "utf-8": flux.Open
    flux.WriteText texte
    flux.SaveToFile chemin, 2
    flux.Close
End Sub
