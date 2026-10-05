# cuelith-sdk

Protocollo, tipi, SDK, componenti UI e strumenti per i moduli di Cuelith.

**Fonte di verità**: il documento di progetto nel repo `cuelith-docs` (Parte V, specifica tecnica). Leggere le parti I–II per capire il prodotto, poi seguire la Parte V alla lettera per le regole "Deciso"; le "Proposta" si cambiano solo dopo conferma del fondatore.

## Regole di questo repo

- **Licenza Apache 2.0, di proposito** (decisione 0012): i plugin incorporano l'SDK e devono poterlo fare con qualsiasi licenza, anche chiusa. Mai copiare qui codice di `cuelith-core` (GPL) né aggiungere dipendenze con licenza copyleft.
- `@cuelith/protocol` è l'unico contratto tra motore, postazioni e moduli. Ogni metodo, tipo o evento si dichiara qui una volta sola (`src/methods.ts`, `src/show.ts`, ...). Una modifica al protocollo aggiorna insieme: tipi qui, motore e postazione in `cuelith-core`, documentazione in `cuelith-docs`, numero di versione (`PROTOCOL_VERSION`, SemVer).
- `@cuelith/sdk` gira nel processo dei moduli (Node, con i permessi di Node attivi): niente dipendenze oltre a `@cuelith/protocol`, stdout riservato al protocollo (console va nel log del motore).
- **Compatibilità in avanti**: chi riceve dati dal motore (pannelli, moduli, postazioni) controlla solo la forma che gli serve e ignora i campi che non conosce. Mai validare con schemi rigidi lo stato ricevuto: un motore più nuovo aggiunge campi e un modulo costruito prima deve continuare a funzionare (`@cuelith/panel` ha una prova apposta). Gli schemi rigidi servono a chi produce i dati (il motore sul proprio stato) e ai file scritti dalle persone (manifest).
- Nessun testo per l'utente nel codice: solo chiavi di traduzione (`protocol.*`, `core.*`). Le lingue sono moduli (famiglia `locale`).
- Dopo ogni modifica agli schemi: `pnpm build && pnpm -C packages/protocol schema` e committare `schema/` (la CI fallisce se non sono aggiornati).
- Prima di ogni commit: `pnpm check` (typecheck, lint, test) verde.
- Lavoro su `dev`; `main` riceve solo release taggate (SemVer).

## Comandi

```bash
pnpm install
pnpm build
pnpm check
```
