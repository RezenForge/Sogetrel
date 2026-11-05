Attribute VB_Name = "RegistreGcbloOutlook"
'==============================================================================
' BrouillonsAttachement - macro OUTLOOK (classique) du Registre GCBLO
'
' La commande "attachement" du registre ecrit les attachements (SBA300497-THF010.xlsx...)
' dans le dossier des attachements, et a cote mails-attachement.csv : un mail par GCBLO
' (destinataires, copie, objet, texte). Cette macro en fait des BROUILLONS Outlook :
'   - A : la boite BL (info_lpc_BL / info_aquitaine_BL), Cc : copie fixe + partenaire
'   - Objet : ATTACHEMENT GCBLO | <GCBLO> | <affect>
'   - le texte, puis VOTRE SIGNATURE Outlook par defaut
'   - l'attachement en piece jointe
' Rien n'est envoye : les brouillons attendent dans "Brouillons" (3 au plus s'ouvrent
' directement). On relit, on clique sur Envoyer.
' Les lignes traitees sont retirees du fichier : relancer la macro ne cree pas de doublon.
' Avant chaque brouillon, la macro cherche si l'attachement a DEJA ETE ENVOYE a une boite BL
' (info_lpc_BL, info_aquitaine_BL), par vous ou par quelqu'un d'autre : dans la Boite de
' reception et les Elements envoyes (et leurs sous-dossiers) de toutes les boites ouvertes
' dans Outlook, dont les boites partagees. Un mail avec une piece jointe au nom du GCBLO,
' adresse a une boite BL -> pas de brouillon, c'est signale a la fin (date, expediteur).
' BrouillonsAttachementForcer : meme chose sans cette verification.
' Une piece jointe introuvable : la ligne reste, signalee a la fin.
'
' Installer (une fois) : dans Outlook, Alt+F11, Fichier > Importer un fichier...,
' choisir BrouillonsAttachement.bas, puis Fichier > Enregistrer.
' Le module s'appelle RegistreGcbloOutlook : un module du meme nom que la macro
' empeche Outlook de la lancer ("Sub ou Function non definie").
' Lancer : Alt+F8 > BrouillonsAttachement. La premiere fois, la macro demande le dossier
' des attachements (celui choisi dans le registre) ; il est garde sur ce PC.
' ChoisirDossierAttachements permet d'en changer.
'==============================================================================
Option Explicit

Private Const APPLI As String = "RegistreGCBLO"
Private Const NOM_CSV As String = "mails-attachement.csv"
Private Const TITRE As String = "Brouillons d'attachement"
Private Const AFFICHER_MAX As Long = 3
Private Const DOSSIER_BROUILLONS As Long = 16          ' olFolderDrafts

'------------------------------------------------------------------------------
Public Sub BrouillonsAttachement()
    Traiter False
End Sub

Public Sub BrouillonsAttachementForcer()
    Traiter True
End Sub

Private Sub Traiter(forcer As Boolean)
    Dim deja As String, dejaEnvoyes As String
    Dim dossier As String, chemin As String, texte As String, lignes() As String
    Dim champs() As String, piece As String, i As Long
    Dim entete As String, restes As String, problemes As String, faits As Collection
    Dim m As Object, ok As Boolean, bilan As String

    dossier = DossierAttachements(False)
    If dossier = "" Then
        MsgBox "Aucun dossier choisi : rien n'a " & ChrW(233) & "t" & ChrW(233) & " fait.", vbExclamation, TITRE
        Exit Sub
    End If
    chemin = dossier & "\" & NOM_CSV
    If Dir(chemin) = "" Then
        MsgBox "Aucun mail d'attachement en attente." & vbCrLf & vbCrLf & _
               "(" & NOM_CSV & " absent de " & dossier & ")" & vbCrLf & _
               "Dans le registre, la commande attachement le cr" & ChrW(233) & "e. " & _
               "Si les attachements sont ailleurs : Alt+F8 > ChoisirDossierAttachements.", vbInformation, TITRE
        Exit Sub
    End If

    texte = LireUtf8(chemin)
    texte = Replace(Replace(texte, ChrW(&HFEFF), ""), vbCrLf, vbLf)
    lignes = Split(texte, vbLf)
    entete = lignes(0)
    Set faits = New Collection

    For i = 1 To UBound(lignes)
        If Trim$(lignes(i)) <> "" Then
            champs = Split(lignes(i), ";")
            If UBound(champs) < 5 Then
                problemes = problemes & vbCrLf & "  ligne illisible : " & Left$(lignes(i), 40)
            Else
                piece = dossier & "\" & champs(1)
                If Dir(piece) = "" Then
                    problemes = problemes & vbCrLf & "  " & champs(0) & " : " & champs(1) & " introuvable"
                    restes = restes & lignes(i) & vbCrLf
                Else
                    deja = ""
                    If Not forcer Then deja = DejaEnvoye(champs(0))
                    If deja <> "" Then
                        dejaEnvoyes = dejaEnvoyes & vbCrLf & "  " & champs(0) & " : " & deja
                        GoTo Suivante
                    End If
                    ok = False
                    Set m = CreerBrouillon(champs, piece, ok)
                    If ok Then
                        faits.Add m
                    Else
                        problemes = problemes & vbCrLf & "  " & champs(0) & " : brouillon non cr" & ChrW(233) & ChrW(233)
                        restes = restes & lignes(i) & vbCrLf
                    End If
                End If
            End If
        End If
Suivante:
    Next i

    ' Le fichier ne garde que ce qui reste a faire
    On Error Resume Next
    If restes = "" Then
        Kill chemin
    Else
        EcrireUtf8 chemin, entete & vbCrLf & restes
    End If
    On Error GoTo 0

    ' Les brouillons : ouverts s'ils sont peu nombreux, sinon le dossier Brouillons
    If faits.Count > 0 Then
        If faits.Count <= AFFICHER_MAX Then
            For Each m In faits
                m.Display
            Next m
        Else
            Application.Session.GetDefaultFolder(DOSSIER_BROUILLONS).Display
        End If
    End If

    bilan = faits.Count & " brouillon(s) d'attachement cr" & ChrW(233) & "(s) dans Brouillons." & vbCrLf & _
            "Relisez, puis Envoyer."
    If dejaEnvoyes <> "" Then
        bilan = bilan & vbCrLf & vbCrLf & "D" & ChrW(233) & "j" & ChrW(224) & " envoy" & ChrW(233) & "(s) " & ChrW(224) & " une bo" & ChrW(238) & "te BL, pas de brouillon :" & dejaEnvoyes & _
                vbCrLf & "(si c'est une erreur : registre > attachement <GCBLO>, puis Alt+F8 > BrouillonsAttachementForcer)"
    End If
    If problemes <> "" Or dejaEnvoyes <> "" Then
        bilan = bilan & vbCrLf & vbCrLf & "Laiss" & ChrW(233) & "(s) en attente (" & NOM_CSV & ") :" & problemes
        MsgBox bilan, vbExclamation, TITRE
    ElseIf faits.Count = 0 Then
        MsgBox "Aucun mail d'attachement en attente.", vbInformation, TITRE
    Else
        MsgBox bilan, vbInformation, TITRE
    End If
End Sub

Public Sub ChoisirDossierAttachements()
    Dim d As String
    d = DossierAttachements(True)
    If d <> "" Then MsgBox "Dossier des attachements : " & d, vbInformation, TITRE
End Sub

'------------------------------------------------------------------------------
' L'attachement de ce GCBLO a-t-il deja ete envoye a une boite BL ? "" si non,
' sinon "le 05/11/2026 par NOM (dossier)". Boite de reception et Elements envoyes
' (avec sous-dossiers) de chaque boite ouverte dans Outlook.
Private Function DejaEnvoye(gcblo As String) As String
    Dim boite As Object, dossier As Object, quel As Variant
    For Each boite In Application.Session.Stores
        For Each quel In Array(6, 5)                    ' olFolderInbox, olFolderSentMail
            Set dossier = Nothing
            On Error Resume Next
            Set dossier = boite.GetDefaultFolder(quel)
            On Error GoTo 0
            If Not dossier Is Nothing Then
                DejaEnvoye = ChercherDans(dossier, gcblo)
                If DejaEnvoye <> "" Then Exit Function
            End If
        Next quel
    Next boite
End Function

Private Function ChercherDans(dossier As Object, gcblo As String) As String
    Dim trouves As Object, it As Object, sous As Object, filtre As String, prefixe As String, r As String, trouve As Boolean

    On Error Resume Next
    prefixe = Left$(gcblo, 9)                           ' SBA300497 : dans l'objet ou le texte
    filtre = "@SQL=(""urn:schemas:httpmail:subject"" LIKE '%" & prefixe & "%' OR " & _
             """urn:schemas:httpmail:textdescription"" LIKE '%" & prefixe & "%') AND " & _
             """urn:schemas:httpmail:hasattachment"" = 1"
    If dossier.DefaultItemType = 0 Then                 ' dossier de mails
        Set trouves = Nothing
        Set trouves = dossier.Items.Restrict(filtre)
        If Not trouves Is Nothing Then
            For Each it In trouves
                ' Sous "On Error Resume Next", une erreur dans un If entre dans le Then :
                ' on calcule donc d'abord, dans une variable qui reste False en cas d'erreur.
                trouve = False
                trouve = (it.Class = 43)                ' olMail
                If trouve Then trouve = PieceDuDossier(it, gcblo)
                If trouve Then trouve = VersBoiteBL(it)
                If trouve Then
                    ChercherDans = "le " & Format(it.SentOn, "dd/mm/yyyy") & " par " & it.SenderName & " (" & dossier.FolderPath & ")"
                    Exit Function
                End If
            Next it
        End If
    End If
    For Each sous In dossier.Folders
        r = ChercherDans(sous, gcblo)
        If r <> "" Then ChercherDans = r: Exit Function
    Next sous
End Function

' Une piece jointe dont le nom contient le GCBLO (tirets, espaces, _ ignores)
Private Function PieceDuDossier(m As Object, gcblo As String) As Boolean
    Dim a As Object, cle As String
    cle = Normaliser(gcblo)
    For Each a In m.Attachments
        If InStr(1, Normaliser(a.FileName), cle, vbBinaryCompare) > 0 Then PieceDuDossier = True: Exit Function
    Next a
End Function

' Envoye a info_lpc_BL ou info_aquitaine_BL (A ou Cc)
Private Function VersBoiteBL(m As Object) As Boolean
    Dim r As Object, t As String
    For Each r In m.Recipients
        t = LCase$(r.Name & " " & r.Address)
        If InStr(t, "info_lpc_bl") > 0 Or InStr(t, "info_aquitaine_bl") > 0 Then VersBoiteBL = True: Exit Function
    Next r
End Function

Private Function Normaliser(ByVal s As String) As String
    s = UCase$(s)
    s = Replace(s, "-", ""): s = Replace(s, " ", ""): s = Replace(s, "_", "")
    Normaliser = s
End Function

'------------------------------------------------------------------------------
' champs : GCBLO;FICHIER;A;CC;OBJET;CORPS (adresses separees par un espace, lignes du texte par \n)
Private Function CreerBrouillon(champs() As String, piece As String, ByRef ok As Boolean) As Object
    Dim m As Object, inspecteur As Object, html As String, corps As String, p As Long

    On Error GoTo Echec
    Set m = Application.CreateItem(0)                   ' olMailItem
    m.To = Adresses(champs(2))
    m.CC = Adresses(champs(3))
    m.Subject = champs(4)
    Set inspecteur = m.GetInspector                     ' Outlook ajoute alors la signature par defaut

    corps = "<div style=""font-family: Aptos, Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);"">" & _
            Replace(Echapper(champs(5)), "\n", "<br>") & "</div>"
    html = m.HTMLBody
    p = InStr(1, html, "<body", vbTextCompare)
    If p > 0 Then p = InStr(p, html, ">")
    If p > 0 Then
        m.HTMLBody = Left$(html, p) & corps & Mid$(html, p + 1)
    Else
        m.HTMLBody = corps & html
    End If

    m.Attachments.Add piece
    m.Save                                              ' dans Brouillons
    Set CreerBrouillon = m
    ok = True
    Exit Function
Echec:
    ok = False
    On Error Resume Next
    If Not m Is Nothing Then m.Delete
End Function

Private Function Adresses(ByVal s As String) As String
    s = Compacter(s)
    Adresses = Replace(s, " ", "; ")
End Function

Private Function Compacter(ByVal s As String) As String
    s = Trim$(s)
    Do While InStr(s, "  ") > 0
        s = Replace(s, "  ", " ")
    Loop
    Compacter = s
End Function

Private Function Echapper(ByVal s As String) As String
    s = Replace(s, "&", "&amp;")
    s = Replace(s, "<", "&lt;")
    s = Replace(s, ">", "&gt;")
    Echapper = s
End Function

'------------------------------------------------------------------------------
' Le dossier des attachements, garde sur ce PC. changer = True : on le redemande.
Private Function DossierAttachements(changer As Boolean) As String
    Dim d As String, explorateur As Object, choix As Object
    d = GetSetting(APPLI, "Outlook", "DossierAttachements", "")
    If Not changer And d <> "" Then
        If Dir(d, vbDirectory) <> "" Then DossierAttachements = d: Exit Function
    End If
    Set explorateur = CreateObject("Shell.Application")
    Set choix = explorateur.BrowseForFolder(0, "Dossier des attachements du registre GCBLO (celui o" & ChrW(249) & " la commande attachement les enregistre)", 0)
    If choix Is Nothing Then Exit Function
    d = choix.Self.Path
    If Right$(d, 1) = "\" Then d = Left$(d, Len(d) - 1)
    SaveSetting APPLI, "Outlook", "DossierAttachements", d
    DossierAttachements = d
End Function

'------------------------------------------------------------------------------
Private Function LireUtf8(chemin As String) As String
    Dim flux As Object
    Set flux = CreateObject("ADODB.Stream")
    flux.Type = 2: flux.Charset = "utf-8": flux.Open
    flux.LoadFromFile chemin
    LireUtf8 = flux.ReadText
    flux.Close
End Function

Private Sub EcrireUtf8(chemin As String, texte As String)
    Dim flux As Object
    Set flux = CreateObject("ADODB.Stream")
    flux.Type = 2: flux.Charset = "utf-8": flux.Open
    flux.WriteText texte
    flux.SaveToFile chemin, 2                           ' 2 = remplace le fichier
    flux.Close
End Sub
