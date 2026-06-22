/**
 * google-identity-services.d.ts
 * Ambient type declaration for the Google Identity Services (GIS) library.
 * Loaded at runtime via <script src="https://accounts.google.com/gsi/client">.
 *
 * Declared once here so login and register pages share the same definition.
 * Without this, declaring `interface Window { google? }` in multiple files
 * causes TS2717 "Subsequent property declarations must have the same type".
 */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              text?: string;
              width?: number;
              shape?: string;
            }
          ) => void;
        };
      };
    };
  }
}

export {};
