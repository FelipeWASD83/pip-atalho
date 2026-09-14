# Pesquisa: barreiras que os sites usam contra o Picture-in-Picture
Data: 2026-09-13 · Projeto: pip-atalho

## Pergunta

Quais barreiras os sites usam para impedir o Picture-in-Picture, e qual delas uma
extensão consegue contornar de verdade — não em teoria?

## Recomendação

Fazer a extensão em camadas, todas disparadas pelo atalho (nada roda sozinho em
site nenhum):

1. **Achar o vídeo certo** em todos os frames e dentro de shadow root, inclusive fechado.
2. **Escolher um só frame** antes de pedir o PiP (duas fases) — porque o primeiro
   pedido consome a "ativação do usuário" e derruba os outros.
3. **Tirar o atributo `disablepictureinpicture` e impedir que o site recoloque** —
   se ele voltar, o Chrome fecha o PiP na hora.
4. **Escudo no mundo da página** contra as três reações hostis conhecidas: pausar
   quando entra em PiP, mandar sair do PiP, e pausar quando a aba some ou o vídeo
   sai da tela.
5. **Regra de rede** para o cabeçalho `Permissions-Policy`, que é a única barreira
   que age antes da página carregar.

O Document Picture-in-Picture (janela flutuante com o player inteiro, legenda
incluída) fica como **modo separado, em outro atalho** — ele resolve o problema da
legenda, mas só funciona no vídeo da página de cima e é mais frágil.

## Barreiras encontradas, uma a uma

| # | Barreira | Quem usa (evidência) | O que resolve |
|---|---|---|---|
| 1 | Atributo `disablepictureinpicture` no `<video>` | Netflix, Crunchyroll, Disney+/ESPN+, Prime Video, Hulu, X/Twitter, Instagram | tirar o atributo antes de pedir |
| 2 | Recolocar o atributo depois (a Hulu recoloca a cada troca de página; o próprio Brave tem código para isso citando a Netflix) | Netflix, Hulu | bloquear a escrita **e** vigiar com `MutationObserver` |
| 3 | Vídeo dentro de iframe de outro domínio | Crunchyroll (`static.crunchyroll.com/vilos-v2/...`) | injetar em todos os frames |
| 4 | Vários frames com vídeo ao mesmo tempo (anúncio + player) | qualquer site com anúncio em iframe | escolher o frame antes de pedir |
| 5 | Pausar o vídeo quando ele entra em PiP | AnimeLab (documentado numa extensão dedicada a isso); o Brave dá `play()` 250 ms depois de entrar justamente por causa disso | bloquear o evento antes de a página ver |
| 6 | Chamar `document.exitPictureInPicture()` para expulsar | padrão citado em extensões do gênero | trocar a função no mundo da página |
| 7 | Pausar quando a aba perde o foco (`visibilitychange`/`blur`) | Twitch, Instagram, Facebook, TikTok | mentir no `document.hidden` e bloquear os eventos |
| 8 | Pausar quando o vídeo sai da tela (rolagem) | feeds em geral | mentir no `isIntersecting` |
| 9 | Cabeçalho `Permissions-Policy: picture-in-picture=()` | **nenhum** dos ~17 sites medidos manda hoje | regra `declarativeNetRequest` |
| 10 | Vídeo em shadow root fechado | não achei nenhum site usando | `chrome.dom.openOrClosedShadowRoot` |
| 11 | Legenda não aparece no PiP | Netflix, Disney+, Max, Hulu, Prime, Udemy (legenda em HTML fora do vídeo); Crunchyroll e sites de anime (legenda ASS desenhada em canvas WebGL) | só Document PiP levando o player inteiro |
| 12 | Remover o `<video>` do DOM ao rolar | X/Twitter | **sem solução** |
| 13 | Vídeo desenhado em canvas em vez de `<video>` | não achei evidência de nenhum site | `canvas.captureStream()` (não vale a pena hoje) |

## O que eu testei

Laboratório próprio: um Brave 153 de verdade (perfil descartável), com a extensão
de teste carregada, páginas servidas por mim com os cabeçalhos e as armadilhas de
cada caso, e o **atalho apertado de verdade** (evento de teclado pelo protocolo de
depuração) — porque só o caminho do atalho carrega a "ativação do usuário".

| Teste | Resultado |
|---|---|
| Atalho abre PiP no vídeo com `disablepictureinpicture` | **ok** |
| Atalho alcança vídeo em iframe de outro domínio | **ok** (o frame de dentro entrou) |
| Duas fases: olhar todos os frames, depois pedir só em um | **ok** — a ativação sobrevive entre as duas injeções |
| Site que pausa no `enterpictureinpicture` | sem escudo pausa; **com escudo não pausa** |
| Site que manda `exitPictureInPicture()` ao entrar | sem escudo o PiP fecha; **com escudo continua aberto** |
| Site recolocando o atributo a cada 200 ms | **derruba o PiP** (confirma o que o código do Chromium diz) |
| `Permissions-Policy: picture-in-picture=()` | sem a regra: `SecurityError`; **com a regra de rede: ok** |
| Injeção no mundo da página com `Content-Security-Policy: script-src 'none'` | **roda igual** (CSP não atrapalha extensão) |
| Vídeo em shadow root **fechado** | `querySelector` acha 0; `chrome.dom` acha 1 |
| Document PiP movendo o vídeo que está tocando | **não pausa e não recarrega** |
| Document PiP de dentro de um iframe | `NotAllowedError` (só funciona na página de cima) |
| Tecla sugerida `Alt+Shift+P` e `Ctrl+Shift+P` | **recusadas** pelo navegador: o comando fica sem atalho e não avisa. `Alt+J`, `Alt+B`, `Alt+I`, `Alt+Shift+J`, `Ctrl+Shift+Y` e `Ctrl+Shift+1` passam |

## Riscos e o que pode dar errado

- **O escudo mexe no mundo da página.** Ele só é instalado quando o atalho é
  apertado, naquela aba, e vale até recarregar. Ainda assim, é o pedaço com mais
  chance de irritar um site (o site deixa de saber que a aba sumiu, por exemplo).
  Se algum site quebrar, o conserto é limitar o escudo àquele domínio.
- **A regra de rede vale para todo site**, o tempo todo, mesmo sem apertar o atalho.
  Ela só acrescenta `picture-in-picture=*` ao cabeçalho — que já é o padrão quando
  o site não diz nada — mas é a única parte da extensão que não é sob demanda.
- **Se o site apagar o `<video>`** (X/Twitter ao rolar), não há o que fazer.
- **Legenda:** no PiP normal, nem o Chrome desenha legenda nem a legenda da Netflix
  e do Crunchyroll é do tipo que ele desenharia. Isso não tem conserto no PiP normal.
- **Document PiP** só serve para vídeo na página de cima e da mesma origem. No
  Crunchyroll (player em iframe de outro domínio) o vídeo recarregaria e pausaria —
  ou seja, lá ele não serve.

## Confirmado / inferência / incerto

**Confirmado** (código-fonte do Chromium + medido aqui): o atributo voltando fecha
o PiP (`html_video_element.cc`, `AttributeChanged` → `ExitPictureInPicture`);
`requestPictureInPicture()` **consome** a ativação do usuário
(`ConsumeTransientUserActivation`), salvo se já houver algo em PiP; o gesto do
atalho chega em todos os frames, inclusive de outro domínio; a ativação sobrevive
entre duas injeções seguidas; CSP da página não bloqueia injeção de extensão;
`chrome.dom.openOrClosedShadowRoot` enxerga shadow root fechado; a regra de
cabeçalho destrava o `Permissions-Policy`; Document PiP é só top-level e não pausa
vídeo da mesma origem; o Chrome não desenha legenda na janela de PiP (status de
implementação do próprio W3C).

**Inferência**: a lista de sites por barreira vem do código de extensões e
userscripts dedicados a cada um deles (Brave, Hulu, Instagram, Crunchyroll, X), não
de eu ter aberto cada site logado. A barreira está confirmada no código de quem a
contorna; qual título de cada serviço ainda faz isso hoje, não.

**Incerto / sem evidência**: nenhum site confirmado usando vídeo em canvas, shadow
root fechado ou sobrescrita de `requestPictureInPicture`; Paramount+, Apple TV+,
Globoplay, Kick, Coursera e Hotmart não foram medidos; a afirmação de que Document
PiP dá tela preta com DRM é alegação de uma extensão, não verificada aqui.

## Fontes

- Chromium: `html_video_element.cc` e `html_video_element_picture_in_picture.cc`
  (comportamento do atributo e consumo da ativação).
- W3C Picture-in-Picture — `implementation-status.md` (legenda não desenhada).
- MDN — `DocumentPictureInPicture.requestWindow()` (exige ativação, só top-level).
- Documentação do Chrome — `declarativeNetRequest` (append em cabeçalho de resposta),
  `scripting.executeScript` (mundos ISOLATED/MAIN), `chrome.dom`.
- Extensão oficial de PiP do Google (não força nada: ela **pula** vídeo com o atributo).
- `brave/adblock-resources` — `brave-auto-pip.js` (observer citando a Netflix).
- Extensões/userscripts lidos: `polywock/pip-unblocker`, `polywock/pipEventBlocker`,
  `thejjw/pip-force`, `apades/dmMiniPlayer`, `amarcu5/PiPer`, `anthonybaldwin/better-hulu-pip`.
- Firefox: `browser/extensions/pictureinpicture/video-wrappers` (onde cada serviço
  põe a legenda).
