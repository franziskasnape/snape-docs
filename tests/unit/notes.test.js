import { describe, expect, it } from 'vitest';
import N from '../../public/notes.js';

describe('private notes cleaner', () => {
  it('keeps simple formatting and lists', () => {
    expect(N.clean('<ul><li>Eins</li><li><b>Zwei</b> und <i>drei</i></li></ul>')).toBe('<ul><li>Eins</li><li><b>Zwei</b> und <i>drei</i></li></ul>');
    expect(N.clean('Zeile<br>Zeile 2<div>Absatz</div>')).toBe('Zeile<br>Zeile 2<div>Absatz</div>');
    expect(N.clean('<STRONG>gross</STRONG>')).toBe('<strong>gross</strong>');
  });
  it('removes scripts and styles together with their content', () => {
    expect(N.clean('Hallo<script>alert(1)</script> Welt')).toBe('Hallo Welt');
    expect(N.clean('a<style>body{display:none}</style>b')).toBe('ab');
    expect(N.clean('<SCRIPT SRC=//evil.example></SCRIPT>ok')).toBe('ok');
    expect(N.clean('x<iframe src="javascript:alert(1)"></iframe>y')).toBe('xy');
  });
  it('strips every attribute, including event handlers and javascript: links', () => {
    expect(N.clean('<b onclick="alert(1)" style="x">B</b>')).toBe('<b>B</b>');
    expect(N.clean('<a href="javascript:alert(1)">Link</a>')).toBe('Link');
    expect(N.clean('<img src=x onerror=alert(1)>Bild')).toBe('Bild');
    expect(N.clean('<svg onload=alert(1)><circle/></svg>Text')).toBe('Text');
    expect(N.clean('<li/onclick=alert(1)>x</li>')).toBe('<li>x</li>');
  });
  it('drops comments and escapes a stray "<"', () => {
    expect(N.clean('a<!-- <script>x</script> -->b')).toBe('ab');
    expect(N.clean('1 < 2 und 3 <4')).toBe('1 &lt; 2 und 3 &lt;4');
    expect(N.clean('<script>never closed')).toBe('');
    expect(N.clean('text <b')).toBe('text &lt;b');
  });
  it('keeps entities as they are (they are text, not markup)', () => {
    expect(N.clean('&lt;script&gt;alert(1)&lt;/script&gt; &amp; mehr')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; mehr');
  });
  it('treats empty or whitespace-only notes as empty', () => {
    expect(N.clean('')).toBe(''); expect(N.clean('   <br> ')).toBe(''); expect(N.clean(null)).toBe(''); expect(N.clean('<div><br></div>')).toBe('');
    expect(N.clean('<ul><li></li></ul>')).toBe('<ul><li></li></ul>');       // an empty bullet is still a list the person just created
  });
  it('is idempotent', () => {
    for (const s of ['<ul><li>a</li></ul>', 'x<script>1</script>y', '1 < 2', '<b onclick=1>x</b>']) expect(N.clean(N.clean(s))).toBe(N.clean(s));
  });
});
