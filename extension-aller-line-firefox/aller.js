/*
 * LINE · aller au dossier — un seul champ, posé PAR-DESSUS le bandeau noir de LINE (la page n'est pas modifiée :
 * le champ est ajouté hors de l'application, en position absolue). Aucune permission, aucun échange avec
 * quoi que ce soit : on tape ou colle un GCBLO (ARC500894-ACF010), Entrée → le dossier LINE.
 * La région vient des trois lettres (même correspondance que le registre GCBLO).
 * Si l'extension « Registre GCBLO » est aussi installée, un seul champ s'affiche.
 */
(() => {
  if (window !== top || document.getElementById('registre-gcblo-aller')) return;
  const REGIONS = { 'Limousin Poitou Charentes': ['SBA', 'LRO', 'POI', 'ANG', 'NIO'], 'Aquitaine': ['MED', 'BOR', 'EST', 'LIB', 'ARC'] };
  const lienDossier = gcblo => {
    const m = String(gcblo).toUpperCase().replace(/\s/g, '').match(/^([A-Z]{3})(\d{6})-([A-Z]+\d*)(\d)$/);
    if (!m) return null;
    const region = Object.keys(REGIONS).find(r => REGIONS[r].includes(m[1]));
    return region ? `https://flashback.orange.fr/line/dossier/travaux/consult/${m[2]}/${m[1]}/${encodeURIComponent(region)}/${m[3]}-${m[4]}/info-gene` : null;
  };
  const champ = document.createElement('input');
  champ.id = 'registre-gcblo-aller';
  champ.placeholder = 'ARC500894-THF010 ⏎';
  champ.title = 'Aller au dossier LINE (Entrée)';
  champ.spellcheck = false;
  champ.autocomplete = 'off';
  champ.style.cssText = 'position:absolute;top:24px;left:50%;transform:translateX(-50%);z-index:2147483646;width:220px;height:30px;'
    + 'box-sizing:border-box;padding:0 10px;border:1px solid #555;border-radius:4px;background:#1a1a1a;color:#fff;'
    + 'font:14px/1 "Helvetica Neue",Arial,sans-serif;letter-spacing:.03em;text-transform:uppercase;outline:none';
  champ.addEventListener('focus', () => { champ.style.borderColor = '#ff7900'; });
  champ.addEventListener('blur', () => { champ.style.borderColor = '#555'; });
  champ.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const url = lienDossier(champ.value);
    if (url) { location.href = url; return; }
    champ.style.borderColor = '#ff4f4f';
    setTimeout(() => { champ.style.borderColor = document.activeElement === champ ? '#ff7900' : '#555'; }, 1200);
  });
  document.documentElement.appendChild(champ);
})();
