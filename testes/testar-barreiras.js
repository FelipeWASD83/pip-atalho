// Bateria de testes da extensao.
//
//   node testes\testar-barreiras.js            (sem janela)
//   node testes\testar-barreiras.js --headful  (mostrando o Brave)
//
// Abre um Brave descartavel (perfil proprio, apagado no fim) com esta pasta
// carregada como extensao, monta uma pagina para cada armadilha conhecida,
// APERTA O ATALHO DE VERDADE (so esse caminho carrega o gesto do usuario) e
// confere o resultado pelo lado da pagina, sem espiar o codigo da extensao.
//
// Precisa do Brave instalado no caminho padrao e do Node 22+ (usa WebSocket
// nativo para falar com o navegador).
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HEADFUL = process.argv.includes('--headful');
const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PORTA_HTTP = 4392;
const PORTA_CDP = 9397;
const EXT = path.join(__dirname, '..');
const PERFIL = path.join(os.tmpdir(), 'lab-pip3-' + Date.now());

// ---------------------------------------------------------------- paginas
function pagina(q) {
  const extra = [];
  if (q.pausaNoEnter === '1')
    extra.push(`v.addEventListener('enterpictureinpicture', () => { window.__reagiu = 'pausou'; v.pause(); });`);
  if (q.saiNoEnter === '1')
    extra.push(`v.addEventListener('enterpictureinpicture', () => { window.__reagiu = 'mandou sair'; document.exitPictureInPicture(); });`);
  if (q.watchdog === '1')
    extra.push(`setInterval(() => { v.setAttribute('disablepictureinpicture',''); v.disablePictureInPicture = true; }, 200);`);
  if (q.visibilidade === '1')
    extra.push(`document.addEventListener('visibilitychange', () => { window.__viuSumir = true; v.pause(); });`);
  if (q.io === '1')
    extra.push(`new IntersectionObserver((es) => { window.__ultimoIO = es[es.length-1].isIntersecting; }, {threshold:0})
                  .observe(document.querySelector('.player'));`);

  const tamanho = q.pequeno === '1' ? '160px;height:90px' : '640px;height:360px';
  const dentroDeSombra = q.sombra === '1';
  const montagem = dentroDeSombra
    ? `const hospedeiro = document.createElement('div');
       document.body.append(hospedeiro);
       hospedeiro.attachShadow({ mode: 'closed' }).append(caixa);`
    : `document.body.append(caixa);`;

  return `<!doctype html><meta charset="utf-8"><title>lab3</title>
<style>.player{position:relative;background:#000;width:${q.pequeno === '1' ? '160px' : '640px'}}
.legenda{position:absolute;bottom:8px;left:0;right:0;text-align:center;color:#fff;font:16px sans-serif}</style>
<body style="margin:0;background:#222">
<div style="height:${q.io === '1' ? '2000px' : '0'}"></div>
<script>
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const ctx = c.getContext('2d');
  let n = 0;
  setInterval(() => { n++; ctx.fillStyle = 'hsl(' + (n*7%360) + ' 80% 50%)'; ctx.fillRect(0,0,640,360); }, 50);
  ctx.fillStyle = '#123'; ctx.fillRect(0,0,640,360);

  const caixa = document.createElement('div');
  caixa.className = 'player';
  const v = document.createElement('video');
  v.muted = true; v.autoplay = true; v.playsInline = true;
  v.style.cssText = 'display:block;width:${tamanho}';
  v.setAttribute('disablepictureinpicture', '');
  v.srcObject = c.captureStream(30);
  const legenda = document.createElement('div');
  legenda.className = 'legenda';
  legenda.textContent = 'LEGENDA DE TESTE';
  caixa.append(v, legenda);
  ${montagem}
  ${extra.join('\n')}
  window.__v = v;
  window.__pronto = new Promise(r => { v.onloadeddata = () => r(true); setTimeout(() => r('timeout'), 3000); });

  // o frame de dentro responde ao de cima, que e de outra origem
  addEventListener('message', (e) => {
    if (e.data !== 'status?') return;
    e.source.postMessage({ pip: !!document.pictureInPictureElement, pausado: v.paused }, '*');
  });
</script>`;
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  const h = { 'content-type': 'text/html; charset=utf-8' };
  if (q.pp === 'bloqueado') h['Permissions-Policy'] = 'picture-in-picture=()';
  res.writeHead(200, h);
  if (url.pathname === '/pai')
    res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#333">
      <script>
        window.__status = () => new Promise((r) => {
          const f = document.querySelector('iframe');
          addEventListener('message', function ouvir(e) { removeEventListener('message', ouvir); r(e.data); }, {once:true});
          f.contentWindow.postMessage('status?', '*');
          setTimeout(() => r('sem-resposta'), 1000);
        });
      </script>
      <iframe src="http://localhost:${PORTA_HTTP}/video?nome=filho" style="width:660px;height:380px;border:0"></iframe>
      <script>
        // video pequeno e decorativo no topo, para disputar com o do iframe
        const c = document.createElement('canvas'); c.width=160; c.height=90;
        c.getContext('2d').fillRect(0,0,160,90);
        const v = document.createElement('video');
        v.muted=true; v.autoplay=true; v.playsInline=true; v.style.cssText='width:160px;height:90px';
        v.srcObject = c.captureStream(30);
        document.body.append(v);
        window.__pronto = new Promise(r => setTimeout(() => r(true), 1500));
      </script>`);
  else res.end(pagina(q));
});

// ---------------------------------------------------------------- CDP
let ws, proximoId = 1;
const pendentes = new Map();
function enviar(method, params = {}, sessionId) {
  const id = proximoId++;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}
async function conectar(url) {
  ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendentes.has(m.id)) {
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };
}
async function esperarCdp(url) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CDP nao respondeu');
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const resultados = [];
function anotar(nome, ok, obtido) {
  resultados.push({ nome, ok });
  console.log((ok ? '  OK   ' : '  FALHA') + ' | ' + nome.padEnd(40) + ' | ' + JSON.stringify(obtido));
}

(async () => {
  await new Promise((r) => servidor.listen(PORTA_HTTP, '0.0.0.0', r));
  const args = [
    '--user-data-dir=' + PERFIL, '--load-extension=' + EXT, '--disable-extensions-except=' + EXT,
    '--remote-debugging-port=' + PORTA_CDP, '--no-first-run', '--no-default-browser-check',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--autoplay-policy=no-user-gesture-required',
    'http://127.0.0.1:' + PORTA_HTTP + '/video',
  ];
  if (!HEADFUL) args.unshift('--headless=new');
  const brave = spawn(BRAVE, args, { stdio: 'ignore' });
  const versao = await esperarCdp('http://127.0.0.1:' + PORTA_CDP + '/json/version');
  await conectar(versao.webSocketDebuggerUrl);
  await enviar('Target.setDiscoverTargets', { discover: true });
  const { targetInfos } = await enviar('Target.getTargets');
  const alvoPagina = targetInfos.find((t) => t.type === 'page' && t.url.includes('/video'));
  const alvoSW = targetInfos.find((t) => t.type === 'service_worker');
  if (!alvoSW) throw new Error('a extensao nao carregou (erro no manifest?)');
  console.log('extensao: ' + alvoSW.url);
  const pag = (await enviar('Target.attachToTarget', { targetId: alvoPagina.targetId, flatten: true })).sessionId;
  await enviar('Runtime.enable', {}, pag);
  await enviar('Page.enable', {}, pag);

  async function avaliar(expressao) {
    const r = await enviar('Runtime.evaluate',
      { expression: expressao, awaitPromise: true, returnByValue: true }, pag);
    if (r.exceptionDetails) return { erro: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  }
  async function ir(caminho) {
    await enviar('Page.navigate', { url: 'http://127.0.0.1:' + PORTA_HTTP + caminho }, pag);
    await dormir(1600);
    await avaliar('window.__pronto || true');
  }
  async function atalho(janela) {
    const tecla = janela
      ? { key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74, nativeVirtualKeyCode: 74 }
      : { key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80 };
    for (const type of ['rawKeyDown', 'keyUp'])
      await enviar('Input.dispatchKeyEvent', Object.assign({ type, modifiers: 1 }, tecla), pag);
    await dormir(1500);
  }
  const emPip = () => avaliar('!!document.pictureInPictureElement');

  // 1. Netflix-like: atributo + watchdog recolocando a cada 200ms
  await ir('/video?watchdog=1');
  await atalho(false);
  const abriu = await emPip();
  await dormir(1500);
  const sobreviveu = await emPip();
  anotar('watchdog: abre e continua aberto', abriu === true && sobreviveu === true, { abriu, sobreviveu });
  await atalho(false);
  anotar('segundo aperto fecha', (await emPip()) === false, {});

  // 2. Crunchyroll-like: player no iframe de outra origem, video pequeno no topo
  await ir('/pai');
  await atalho(false);
  const noTopo = await emPip();
  const statusFilho = await avaliar('window.__status()');
  anotar('escolhe o video do iframe, nao o do topo',
    noTopo === false && statusFilho && statusFilho.pip === true, { topo: noTopo, filho: statusFilho });
  await atalho(false);

  // 3. site que pausa quando entra em PiP
  await ir('/video?pausaNoEnter=1');
  await atalho(false);
  const r3 = await avaliar('({pip: !!document.pictureInPictureElement, pausado: __v.paused, reagiu: window.__reagiu || null})');
  anotar('site que pausa no enter', r3.pip === true && r3.pausado === false, r3);
  await atalho(false);

  // 4. site que manda sair do PiP
  await ir('/video?saiNoEnter=1');
  await atalho(false);
  const r4 = await avaliar('({pip: !!document.pictureInPictureElement, reagiu: window.__reagiu || null})');
  anotar('site que manda sair do PiP', r4.pip === true, r4);
  await atalho(false);

  // 5. video dentro de shadow root FECHADO
  await ir('/video?sombra=1');
  await atalho(false);
  anotar('video em shadow root fechado', (await emPip()) === true, {});
  await atalho(false);

  // 6. Permissions-Policy bloqueando
  await ir('/video?pp=bloqueado');
  await atalho(false);
  anotar('Permissions-Policy destravado pela regra', (await emPip()) === true, {});
  await atalho(false);

  // 7. aba sumindo (visibilitychange) nao pausa enquanto o PiP esta aberto
  await ir('/video?visibilidade=1');
  await atalho(false);
  await avaliar(`document.dispatchEvent(new Event('visibilitychange'))`);
  await dormir(400);
  const r7 = await avaliar('({pausado: __v.paused, viuSumir: !!window.__viuSumir})');
  anotar('aba sumindo nao pausa o video', r7.pausado === false && r7.viuSumir === false, r7);
  await atalho(false);

  // 8. rolagem: IntersectionObserver mente enquanto o PiP esta aberto
  await ir('/video?io=1');
  await atalho(false);
  await avaliar('window.scrollTo(0, 3000)');
  await dormir(600);
  const r8 = await avaliar('({ultimoIO: window.__ultimoIO, pausado: __v.paused})');
  anotar('video fora da tela continua "visivel"', r8.ultimoIO !== false, r8);
  await atalho(false);

  // 9. Alt+Shift+P: janela flutuante leva a legenda junto e o video nao pausa
  await ir('/video');
  await atalho(true);
  const r9 = await avaliar(`(() => {
    const j = window.documentPictureInPicture && window.documentPictureInPicture.window;
    if (!j) return { janela: false };
    return {
      janela: true,
      temVideo: !!j.document.querySelector('video'),
      temLegenda: !!j.document.querySelector('.legenda'),
      pausado: j.document.querySelector('video').paused,
      andou: j.document.querySelector('video').currentTime > 0,
      sumiuDaPagina: !document.body.contains(document.querySelector('.player')),
    };
  })()`);
  anotar('janela flutuante com legenda',
    r9.janela === true && r9.temLegenda === true && r9.pausado === false, r9);

  // 10. fechar a janela devolve o player para o lugar
  await atalho(true);
  await dormir(600);
  const r10 = await avaliar(`(() => {
    const p = document.querySelector('.player');
    return { janelaAberta: !!(window.documentPictureInPicture && window.documentPictureInPicture.window),
             voltou: !!p && document.body.contains(p),
             temAtributoSobrando: !!p && p.hasAttribute('data-pip-atalho') };
  })()`);
  anotar('fechar devolve o player para a pagina',
    r10.janelaAberta === false && r10.voltou === true && r10.temAtributoSobrando === false, r10);

  console.log('\n--- resumo ---');
  const falhas = resultados.filter((r) => !r.ok);
  for (const r of resultados) console.log((r.ok ? 'OK    ' : 'FALHA ') + r.nome);
  console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo passou.');
  ws.close(); brave.kill(); servidor.close();
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch {}
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error('ERRO NO LAB: ' + e.message); process.exit(1); });
