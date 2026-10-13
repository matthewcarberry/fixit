import crypto from "node:crypto";

/**
 * Just enough of a passkey authenticator to drive the server's WebAuthn routes in tests:
 * one P-256 key, "none" attestation, and a signature counter.
 */
export class SoftAuthenticator {
  private readonly keys = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  readonly credentialId = crypto.randomBytes(16);
  private counter = 0;

  constructor(private readonly origin: string) {}

  get id() {
    return b64url(this.credentialId);
  }

  register(options: { challenge: string; rp: { id?: string } }) {
    const jwk = this.keys.publicKey.export({ format: "jwk" });
    const coseKey = cbor(
      new Map<number, unknown>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]),
    );
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      this.header(options.rp.id!, 0x01 | 0x04 | 0x40),
      Buffer.alloc(16),
      idLength,
      this.credentialId,
      coseKey,
    ]);
    const attestationObject = cbor(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: this.clientData("webauthn.create", options.challenge),
        attestationObject: b64url(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  signIn(options: { challenge: string; rpId?: string }, overrides: { origin?: string } = {}) {
    this.counter += 1;
    const authData = this.header(options.rpId!, 0x01 | 0x04);
    const clientDataJSON = this.clientData("webauthn.get", options.challenge, overrides.origin);
    const signed = Buffer.concat([authData, crypto.createHash("sha256").update(Buffer.from(clientDataJSON, "base64url")).digest()]);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON,
        authenticatorData: b64url(authData),
        signature: b64url(crypto.sign("sha256", signed, this.keys.privateKey)),
      },
      clientExtensionResults: {},
    };
  }

  private header(rpId: string, flags: number) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    return Buffer.concat([crypto.createHash("sha256").update(rpId).digest(), Buffer.from([flags]), count]);
  }

  private clientData(type: string, challenge: string, origin = this.origin) {
    return b64url(Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false })));
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function cbor(value: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  };
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (value instanceof Map) {
    const parts: Buffer[] = [head(5, value.size)];
    for (const [k, v] of value) parts.push(cbor(k), cbor(v));
    return Buffer.concat(parts);
  }
  throw new Error(`can't encode ${typeof value}`);
}
