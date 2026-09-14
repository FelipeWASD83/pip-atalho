# CLAUDE.md — pip-atalho

Extensão do Brave (Manifest V3, JS puro, sem build e sem dependência) que força
Picture-in-Picture pelo teclado. O `README.md` explica o uso; este arquivo existe
para não refazer descoberta que já custou teste.

## 1. As duas regras que mandam no desenho do `background.js`

1. **A primeira injeção tem que sair síncrona de dentro do listener do comando.**
   É ela que leva o gesto do usuário para dentro de cada frame da aba. Pôr um
   `await` antes dela mata o gesto, e o navegador recusa o PiP com
   `NotAllowedError`. Depois dessa primeira injeção o frame guarda a ativação por
   alguns segundos — **medido**: as injeções seguintes podem ser assíncronas.
2. **Pedir o PiP consome a ativação, e o consumo vale para a aba inteira.** Por
   isso o fluxo é em duas fases: `vistoriar` em todos os frames, escolher um, e só
   então pedir. Se todos os frames pedissem juntos, o primeiro ganharia e os
   outros morreriam com `NotAllowedError` — e quem ganha é aleatório.

## 2. O que já está confirmado (não testar de novo no escuro)

- **Se o atributo `disablepictureinpicture` voltar para o vídeo que está em PiP,
  o navegador fecha o PiP na hora.** Está no código do Chromium
  (`html_video_element.cc`, `AttributeChanged` → `ExitPictureInPicture`) e foi
  reproduzido aqui. Por isso não basta remover o atributo: o escudo bloqueia a
  escrita no mundo da página e um `MutationObserver` remove o que escapar.
- **CSP da página não atrapalha** injeção de extensão, nem no mundo principal.
- **`chrome.dom.openOrClosedShadowRoot` enxerga shadow root fechado**; o
  `querySelector` não.
- **Document Picture-in-Picture só existe na página de cima** e, movendo um vídeo
  da mesma origem, não pausa nem recarrega. De dentro de iframe dá `NotAllowedError`.
- **`Alt+Shift+P` e `Ctrl+Shift+P` são recusados pelo navegador** como tecla
  sugerida — o comando fica sem atalho, calado. Foi por isso que a janela flutuante
  ficou no `Alt+J`. Se for trocar tecla, conferir com `chrome.commands.getAll()`
  que ela foi mesmo aceita.
- A regra de rede (`regras-de-rede.json`) é a única parte que vale sempre, em todo
  site, mesmo sem apertar o atalho. Ela só acrescenta `picture-in-picture=*` ao
  cabeçalho `Permissions-Policy` (que já é o padrão quando o site não diz nada) e
  remove o `Feature-Policy`, que é legado.

A pesquisa completa — quais sites usam qual barreira, com fonte — está em
`docs/pesquisa-barreiras-de-pip.md`.

## 3. O escudo mexe no mundo da página

`escudo()` é a única parte que altera o ambiente do site: ele mente no
`document.hidden`, no `isIntersecting`, e troca `exitPictureInPicture` e a escrita
do atributo. Só é instalado quando o atalho é apertado, só naquele frame, e quase
tudo fica inerte quando o PiP não está aberto.

**Se algum site quebrar, é o primeiro suspeito.** O conserto previsto é limitar o
escudo por domínio, não abandoná-lo.

## 4. Testar

```powershell
node testes\testar-barreiras.js
```

Sobe um Brave descartável (perfil próprio, headless), carrega esta pasta como
extensão, monta uma página para cada armadilha conhecida, **aperta o atalho de
verdade** e confere o resultado pelo lado da página. Tem que terminar com "Tudo
passou". Qualquer mudança no `background.js` passa por aqui antes de ser dada como
pronta — o teste é rápido (~1 min) e já pegou um comando que tinha ficado sem tecla.
