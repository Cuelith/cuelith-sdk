# cuelith-sdk

Protocollo, tipi, SDK e strumenti per costruire moduli di [Cuelith](https://github.com/Cuelith/cuelith-core), il software di proiezione live con un nucleo leggero e tutto il resto installabile come modulo.

| Pacchetto           | Contenuto                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@cuelith/protocol` | Modello dati dello show, stato live, manifest dei moduli, layout delle modalità, metodi JSON-RPC e codici d'errore                  |
| `@cuelith/ui`       | Colori, font (inclusi, funzionano offline) e classi di base comuni a postazione e pannelli dei moduli: `@cuelith/ui/cuelith-ui.css` |
| `@cuelith/panel`    | Per i pannelli dei moduli (iframe isolati): collegamento alla postazione, testi tradotti, stato dello show, comandi                 |
| `@cuelith/sdk`      | Per i moduli con codice (processo separato): `definePlugin`, comandi, eventi, stato dello show, spazio dati, log                    |

In arrivo: `@cuelith/cli` (`cuelith-plugin new | dev | pack`). Un modulo d'esempio completo, da copiare per iniziare, è [`plugin-template`](https://github.com/Cuelith/plugin-template).

Gli schemi JSON pubblici sono in [`schema/`](schema): `show-1.json` (file `.cuelith`), `plugin-1.json` (`cuelith-plugin.json`), `layout-1.json` (modalità).

Specifica completa: repo [`cuelith-docs`](https://github.com/Cuelith/cuelith-docs). Licenza Apache 2.0, di proposito diversa da quella del nucleo (GPL 3.0 o successiva): chi scrive un plugin incorpora l'SDK e deve poterlo fare con qualsiasi licenza, anche chiusa e a pagamento. L'[eccezione per i plugin](https://github.com/Cuelith/cuelith-core/blob/main/PLUGIN-EXCEPTION.md) del nucleo copre il resto dell'interfaccia.
