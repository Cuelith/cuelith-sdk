# cuelith-sdk

Protocollo, tipi, SDK e strumenti per costruire moduli di [Cuelith](https://github.com/Cuelith/cuelith-core), il software di proiezione live con un nucleo leggero e tutto il resto installabile come modulo.

| Pacchetto           | Contenuto                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@cuelith/protocol` | Modello dati dello show, stato live, manifest dei moduli, layout delle modalità, metodi JSON-RPC e codici d'errore                  |
| `@cuelith/ui`       | Colori, font (inclusi, funzionano offline) e classi di base comuni a postazione e pannelli dei moduli: `@cuelith/ui/cuelith-ui.css` |

In arrivo: `@cuelith/sdk` (`definePlugin`, contesto del modulo), `@cuelith/cli` (`cuelith-plugin new | dev | pack`).

Gli schemi JSON pubblici sono in [`schema/`](schema): `show-1.json` (file `.cuelith`), `plugin-1.json` (`cuelith-plugin.json`), `layout-1.json` (modalità).

Specifica completa: repo [`cuelith-docs`](https://github.com/Cuelith/cuelith-docs). Licenza Apache 2.0.
