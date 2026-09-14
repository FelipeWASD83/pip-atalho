// PiP no atalho
//
// Alt+P        -> Picture-in-Picture normal no melhor video da aba.
// Alt+Shift+P  -> janela flutuante com o player inteiro (leva a legenda junto).
//
// Duas regras nao obvias mandam no desenho deste arquivo:
//
// 1. A PRIMEIRA injecao tem que sair sincrona de dentro do listener. E ela que
//    leva o "gesto do usuario" para dentro de cada frame da aba; sem gesto o
//    navegador recusa o PiP. Depois dela o frame guarda essa ativacao por alguns
//    segundos, entao as injecoes seguintes podem ser assincronas.
// 2. Pedir o PiP CONSOME essa ativacao, e o consumo vale para a aba inteira.
//    Por isso a vistoria e o pedido sao separados: se todos os frames pedissem
//    de uma vez, o primeiro ganharia e os outros morreriam com NotAllowedError.

chrome.action.onClicked.addListener((aba) => {
  if (aba && aba.id != null) acionar(aba.id, 'pip');
});

chrome.commands.onCommand.addListener((comando, aba) => {
  if (comando === 'janela' && aba && aba.id != null) acionar(aba.id, 'janela');
});

function acionar(idDaAba, modo) {
  chrome.scripting
    .executeScript({ target: { tabId: idDaAba, allFrames: true }, func: vistoriar })
    .then((achados) => decidir(idDaAba, modo, achados))
    .catch(() => {}); // paginas internas do navegador nao aceitam injecao
}

async function decidir(idDaAba, modo, achados) {
  const frames = achados
    .filter((a) => a && a.result)
    .map((a) => Object.assign({ frameId: a.frameId }, a.result));

  const aberto = frames.find((f) => f.temPip || f.temJanela);
  if (aberto) {
    await injetar(idDaAba, aberto.frameId, fechar);
    return;
  }

  const comVideo = frames.filter((f) => f.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  if (!comVideo.length) return;

  // A janela flutuante so existe na pagina de cima. Se o melhor video estiver
  // dentro de um iframe (Crunchyroll, por exemplo), cai para o PiP normal.
  const noTopo = comVideo.filter((f) => f.topo);
  const querJanela = modo === 'janela' && noTopo.length > 0;
  const alvo = querJanela ? noTopo[0] : comVideo[0];

  await injetar(idDaAba, alvo.frameId, escudo, 'MAIN');
  await injetar(idDaAba, alvo.frameId, querJanela ? abrirJanela : abrirPip);
}

function injetar(idDaAba, frameId, func, mundo) {
  return chrome.scripting
    .executeScript({ target: { tabId: idDaAba, frameIds: [frameId] }, func, world: mundo || 'ISOLATED' })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Daqui para baixo tudo roda dentro da pagina. As funcoes viajam como texto,
// entao cada uma tem que se bastar: nada de chamar as outras daqui.
// ---------------------------------------------------------------------------

// Mundo isolado: acha o melhor video do frame, guarda e devolve a nota.
function vistoriar() {
  const estado = (window.__pipAtalho = window.__pipAtalho || {});

  const videos = [];
  const visitar = (raiz, nivel) => {
    if (nivel > 8) return;
    let contador = 0;
    for (const el of raiz.querySelectorAll('*')) {
      if (++contador > 20000) break;
      if (el.tagName === 'VIDEO') videos.push(el);
      // Pega tambem o que esta dentro de shadow root fechado, que o
      // querySelector nao enxerga.
      let sombra = null;
      try {
        sombra = chrome.dom.openOrClosedShadowRoot(el);
      } catch (e) {}
      if (sombra) visitar(sombra, nivel + 1);
    }
  };
  visitar(document, 0);

  let melhor = null;
  let pontos = 0;
  for (const v of videos) {
    if (v.readyState < 1 || !v.videoWidth) continue;
    const caixa = v.getBoundingClientRect();
    const area = caixa.width * caixa.height || (v.videoWidth * v.videoHeight) / 20;
    const nota = area * (v.paused ? 1 : 4);
    if (nota > pontos) {
      pontos = nota;
      melhor = v;
    }
  }
  estado.alvo = melhor;

  return {
    pontos,
    topo: window.top === window,
    temPip: !!document.pictureInPictureElement,
    temJanela: !!(window.documentPictureInPicture && window.documentPictureInPicture.window),
  };
}

// Mundo da pagina: desarma as reacoes do site. So e instalado quando o atalho e
// apertado, e quase tudo so vale enquanto o PiP esta aberto.
function escudo() {
  if (window.__pipAtalhoEscudo) return 'ja';
  window.__pipAtalhoEscudo = true;

  let ativo = false;
  const avisar = (nome) => window.dispatchEvent(new CustomEvent('__pip-atalho-estado', { detail: nome }));

  // Os eventos de PiP nao chegam na pagina: tem site que pausa o video ou manda
  // sair do PiP assim que ve que entrou.
  window.addEventListener('enterpictureinpicture', (e) => {
    ativo = true;
    e.stopImmediatePropagation();
    avisar('entrou');
  }, true);
  window.addEventListener('leavepictureinpicture', (e) => {
    ativo = false;
    e.stopImmediatePropagation();
    avisar('saiu');
  }, true);
  // A janela flutuante nao dispara esses eventos, entao o lado isolado avisa.
  window.addEventListener('__pip-atalho', (e) => {
    ativo = !!(e.detail && e.detail.ativo);
  }, true);

  // Enquanto o PiP esta aberto, a pagina nao fica sabendo que a aba sumiu nem
  // que o video saiu da tela — os dois motivos classicos de pausar sozinho.
  for (const evento of ['visibilitychange', 'webkitvisibilitychange', 'blur']) {
    window.addEventListener(evento, (e) => {
      if (ativo) e.stopImmediatePropagation();
    }, true);
  }

  const mentir = (objeto, propriedade, valor, quando) => {
    const original = Object.getOwnPropertyDescriptor(objeto, propriedade);
    if (!original || !original.get) return;
    Object.defineProperty(objeto, propriedade, {
      configurable: true,
      get() {
        if (ativo && (!quando || quando(this))) return valor;
        return original.get.call(this);
      },
    });
  };
  mentir(Document.prototype, 'hidden', false);
  mentir(Document.prototype, 'visibilityState', 'visible');
  const focoOriginal = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function () {
    return ativo ? true : focoOriginal.call(this);
  };

  const ehDoVideo = (entrada) => {
    const alvo = entrada && entrada.target;
    return !!(alvo && (alvo.tagName === 'VIDEO' || (alvo.querySelector && alvo.querySelector('video'))));
  };
  mentir(IntersectionObserverEntry.prototype, 'isIntersecting', true, ehDoVideo);
  mentir(IntersectionObserverEntry.prototype, 'intersectionRatio', 1, ehDoVideo);

  // A pagina nao consegue mais fechar o PiP...
  const sairOriginal = Document.prototype.exitPictureInPicture;
  Document.prototype.exitPictureInPicture = function () {
    return ativo ? Promise.resolve() : sairOriginal.call(this);
  };

  // ...nem recolocar a trava no video. Se o atributo voltar, o navegador fecha
  // o PiP na hora, entao aqui a escrita e simplesmente ignorada.
  const TRAVA = 'disablepictureinpicture';
  const propriedade = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'disablePictureInPicture');
  if (propriedade && propriedade.set) {
    Object.defineProperty(HTMLVideoElement.prototype, 'disablePictureInPicture', {
      configurable: true,
      get() {
        return propriedade.get.call(this);
      },
      set(valor) {
        if (!valor) propriedade.set.call(this, valor);
      },
    });
  }
  const porAtributo = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (nome, valor) {
    if (this instanceof HTMLVideoElement && String(nome).toLowerCase() === TRAVA) return;
    return porAtributo.call(this, nome, valor);
  };
  const alternarAtributo = Element.prototype.toggleAttribute;
  Element.prototype.toggleAttribute = function (nome, forcar) {
    if (this instanceof HTMLVideoElement && String(nome).toLowerCase() === TRAVA) return false;
    return alternarAtributo.call(this, nome, forcar);
  };

  return 'instalado';
}

// Mundo isolado: tira a trava, vigia para ela nao voltar e pede o PiP.
function abrirPip() {
  const estado = (window.__pipAtalho = window.__pipAtalho || {});
  const v = estado.alvo && estado.alvo.isConnected ? estado.alvo : document.querySelector('video');
  if (!v) return 'sem-alvo';

  const destravar = () => {
    v.disablePictureInPicture = false;
    v.removeAttribute('disablepictureinpicture');
  };
  destravar();
  if (estado.observador) estado.observador.disconnect();
  estado.observador = new MutationObserver(destravar);
  estado.observador.observe(v, { attributes: true, attributeFilter: ['disablepictureinpicture'] });

  const limpar = () => {
    if (estado.observador) {
      estado.observador.disconnect();
      estado.observador = null;
    }
    window.dispatchEvent(new CustomEvent('__pip-atalho', { detail: { ativo: false } }));
  };

  window.dispatchEvent(new CustomEvent('__pip-atalho', { detail: { ativo: true } }));

  return v.requestPictureInPicture().then(
    () => {
      // Site que pausa o video assim que o PiP abre: devolve o play por 2s.
      let tentativas = 3;
      const revidar = () => {
        if (tentativas-- > 0) v.play().catch(() => {});
      };
      v.addEventListener('pause', revidar);
      setTimeout(() => v.removeEventListener('pause', revidar), 2000);

      v.addEventListener('leavepictureinpicture', limpar, { once: true });
      window.addEventListener('__pip-atalho-estado', (e) => {
        if (e.detail === 'saiu') limpar();
      }, { once: true });
      return 'ok';
    },
    (erro) => {
      limpar();
      return erro.name;
    }
  );
}

// Mundo isolado, so na pagina de cima: leva a caixa do player para uma janela
// flutuante de verdade. E o unico jeito de a legenda aparecer, porque legenda de
// Netflix e de anime e desenhada fora do video e o PiP normal nao a leva.
function abrirJanela() {
  const estado = (window.__pipAtalho = window.__pipAtalho || {});
  const v = estado.alvo && estado.alvo.isConnected ? estado.alvo : document.querySelector('video');
  if (!v) return 'sem-alvo';
  if (!window.documentPictureInPicture) return 'sem-api';

  // Sobe do video ate o ancestral que ainda tem o tamanho dele: e a caixa onde
  // o site desenha legenda e controles.
  const caixaDoVideo = v.getBoundingClientRect();
  const areaDoVideo = caixaDoVideo.width * caixaDoVideo.height || 1;
  let caixa = v;
  for (let i = 0; i < 6; i++) {
    const pai = caixa.parentElement;
    if (!pai || pai === document.body || pai === document.documentElement) break;
    const r = pai.getBoundingClientRect();
    if (r.width * r.height > areaDoVideo * 1.6) break;
    caixa = pai;
  }

  return window.documentPictureInPicture
    .requestWindow({
      width: Math.min(v.videoWidth || 640, 1280),
      height: Math.min(v.videoHeight || 360, 720),
    })
    .then((janela) => {
      for (const folha of Array.from(document.styleSheets)) {
        try {
          const css = Array.from(folha.cssRules).map((r) => r.cssText).join('\n');
          const tag = janela.document.createElement('style');
          tag.textContent = css;
          janela.document.head.append(tag);
        } catch (e) {
          if (folha.href) {
            const link = janela.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = folha.href;
            janela.document.head.append(link);
          }
        }
      }
      const base = janela.document.createElement('style');
      base.textContent =
        'html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
        '[data-pip-atalho]{position:relative!important;inset:auto!important;width:100%!important;' +
        'height:100%!important;max-width:none!important;max-height:none!important;transform:none!important}' +
        '[data-pip-atalho] video{width:100%!important;height:100%!important;object-fit:contain!important}';
      janela.document.head.append(base);

      const marcador = document.createElement('div');
      marcador.style.display = 'none';
      caixa.before(marcador);
      caixa.setAttribute('data-pip-atalho', '');
      janela.document.body.append(caixa);
      estado.janela = janela;
      window.dispatchEvent(new CustomEvent('__pip-atalho', { detail: { ativo: true } }));

      janela.addEventListener('pagehide', () => {
        caixa.removeAttribute('data-pip-atalho');
        marcador.replaceWith(caixa);
        estado.janela = null;
        window.dispatchEvent(new CustomEvent('__pip-atalho', { detail: { ativo: false } }));
      });
      return 'ok';
    })
    .catch((erro) => {
      window.dispatchEvent(new CustomEvent('__pip-atalho', { detail: { ativo: false } }));
      return erro.name;
    });
}

// Mundo isolado: desliga o que estiver aberto.
function fechar() {
  const estado = (window.__pipAtalho = window.__pipAtalho || {});
  if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
    window.documentPictureInPicture.window.close();
    return 'fechou-janela';
  }
  if (estado.observador) {
    estado.observador.disconnect();
    estado.observador = null;
  }
  window.dispatchEvent(new CustomEvent('__pip-atalho', { detail: { ativo: false } }));
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
    return 'fechou-pip';
  }
  return 'nada';
}
