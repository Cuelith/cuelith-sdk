# cuelith-sdk

Protocollo, tipi, SDK, componenti UI e strumenti per i moduli di Cuelith.

**Fonte di verità**: il documento di progetto nel repo `cuelith-docs` (Parte V, specifica tecnica). Leggere le parti I–II per capire il prodotto, poi seguire la Parte V alla lettera per le regole "Deciso"; le "Proposta" si cambiano solo dopo conferma del fondatore.

## Regole di questo repo

- **Registry dei plugin a pagamento** (decisione 0013, protocollo 1.14): `RegistryPluginSchema` ha `access`, `price`, `checkoutUrl` (solo `lemonsqueezy.com`, https, senza `utente@`), `licensing` (fornitore ammesso, `storeId`, `productId`) e `authorKey`; con `authorKey` ogni versione ha `signature` (Ed25519 su `packageSignatureMessage`). I campi sono tutti opzionali: una voce vecchia resta valida. `LICENSE_MAX_DEVICES = 3`. Dopo ogni cambio: `pnpm build`, `pnpm schema` e controllare il nucleo con `turbo ... --force`.
- **Licenze dei plugin** (protocollo 1.15, decisione 0013): `license.ts` del protocollo ha il permesso firmato dal Notaio (`LicenseTokenPayloadSchema`), le chiavi pubbliche del Notaio (`NOTARY_PUBLIC_KEYS`, `n1`), la verifica con WebCrypto senza dipendenze (`verifyLicenseToken`, `verifyLicenseProof`) e i metodi `license.*`. La compilazione non conosce i tipi di `TextEncoder`/`atob`/`crypto`: si usano via `globalThis` (vedi `license.ts`). `@cuelith/sdk` espone `ctx.license.verify()`: il plugin chiede al nucleo la prova (permesso + firma del computer su una sfida casuale) e la verifica da sé. Il formato del permesso è anche nel Notaio del sito (`cuelith-site/functions/_lib/notary.js`): la prova `license.test.ts` li tiene d'accordo se il sito è affiancato.
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
