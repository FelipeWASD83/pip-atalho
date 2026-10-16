# pip-atalho

Extensão do Brave que joga o vídeo da aba numa janelinha flutuante com um atalho
de teclado — inclusive nos sites que bloqueiam o Picture-in-Picture (Netflix,
Crunchyroll, Disney+, Prime Video, Hulu, X, Instagram).

## Instalar

1. Abrir `brave://extensions` e ligar **Modo do desenvolvedor** (canto superior direito).
2. Clicar em **Carregar sem compactação** e escolher esta pasta (`pip-atalho`).
3. Não mover nem apagar a pasta depois: o Brave carrega a extensão direto dela.

## Usar

- **Alt+P** — Picture-in-Picture normal, no maior vídeo da aba. Aperta de novo e fecha.
- **Alt+J** — janela flutuante com o **player inteiro, com legenda**. Aperta de novo e fecha.
- Clicar no ícone da extensão faz o mesmo que o Alt+P.

### Qual dos dois usar

O Alt+P é o do dia a dia. O problema dele é legenda: a legenda da Netflix e a de
anime não são desenhadas pelo navegador, e sim pelo site, por cima do vídeo — o
Picture-in-Picture normal leva só o vídeo, então a legenda fica para trás. **Isso
não tem conserto no Alt+P**, é assim para qualquer extensão.

O Alt+J resolve isso por outro caminho: ele leva o player inteiro (vídeo, legenda
e controles do site) para uma janela de verdade, e devolve tudo para o lugar quando
você fecha. Em troca, ele é mais delicado: só funciona quando o player está na
própria página. No Crunchyroll, que roda o player dentro de um iframe de outro
domínio, o Alt+J **cai sozinho no Picture-in-Picture normal**.

## O que ela contorna

Tudo isto foi testado num Brave de verdade, com o atalho apertado de verdade:

- o atributo que desliga o PiP no vídeo (o bloqueio da Netflix e do Crunchyroll);
- o site **recolocando** esse atributo — que, sem defesa, faz o navegador fechar o PiP na hora;
- vídeo dentro de iframe de outro domínio (o player do Crunchyroll);
- vídeo dentro de shadow root, inclusive fechado;
- página com vários vídeos (anúncio no topo, player no iframe): escolhe o maior que está tocando;
- site que pausa o vídeo quando ele entra em PiP;
- site que manda sair do PiP assim que entra;
- site que pausa quando a aba perde o foco ou quando o vídeo sai da tela;
- o cabeçalho `Permissions-Policy` proibindo PiP.

## O que ela não resolve

- **Legenda no Alt+P** (use o Alt+J, onde der).
- **X/Twitter apagando o vídeo** quando você rola a página: o vídeo deixa de existir,
  não há o que segurar.
- **Alt+J em player dentro de iframe de outro domínio** (Crunchyroll): cai no Alt+P.

## Trocar as teclas

`brave://extensions/shortcuts`. O atalho precisa ter Alt ou Ctrl. Atenção:
`Alt+Shift+P` e `Ctrl+Shift+P` são reservados pelo navegador e **não** podem ser
usados (foi por isso que a janela ficou no Alt+J).

## Depois de mexer no código

1. Em `brave://extensions`, clicar na setinha de recarregar no card da extensão.
2. Rodar a bateria de testes:

```powershell
node testes\testar-barreiras.js
```

Ela abre um Brave descartável, com perfil separado, monta uma página para cada
armadilha conhecida, aperta o atalho e confere o resultado. Tem que terminar com
"Tudo passou".

## Licença

Código sob a licença MIT (arquivo `LICENSE`).
