// Talks to our own /api/gemini proxy, never to Google directly.

function parseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('Hana-sensei got confused. Please try again.');
  }
}

export async function askJSON({ system, contents, temperature = 0.7 }, retried = false) {
  let res;
  try {
    res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-pass': localStorage.getItem('sb_pass') || '' },
      body: JSON.stringify({ system, contents, temperature })
    });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  if (res.status === 401 && !retried) {
    const p = window.prompt('Enter the Study Buddy passcode');
    if (p) {
      localStorage.setItem('sb_pass', p.trim());
      return askJSON({ system, contents, temperature }, true);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return parseJSON(data.text);
}

export function fileToPart(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ inline_data: { mime_type: file.type || 'application/pdf', data: String(r.result).split(',')[1] } });
    r.onerror = () => reject(new Error('Could not read that file'));
    r.readAsDataURL(file);
  });
}
