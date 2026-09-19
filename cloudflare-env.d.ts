declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_PASSWORD?: string;
    LINE_CHANNEL_SECRET?: string;
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    LINE_OFFICIAL_ACCOUNT_URL?: string;
  }
}
