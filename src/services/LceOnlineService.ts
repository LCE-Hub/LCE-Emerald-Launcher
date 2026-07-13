const SESSION_KEY = "lceonline_session";
const SOCIAL_BASE_URL = "https://social.mclegacyedition.xyz";
const AUTH_BASE_URL = "https://auth.mclegacyedition.xyz"; //neo: yeah bro im hardcoding all three
import { TauriService } from "./TauriService";
export interface LceOnlineAccount {
  username: string;
  displayName: string;
}

export interface SessionData {
  accessToken: string;
  account: LceOnlineAccount;
}

export interface FriendRequest {
  username: string;
  displayName: string;
}

export class LceOnlineService {
  private _session: SessionData | null = null;
  private baseUrl: string = SOCIAL_BASE_URL;
  private _listeners: Array<() => void> = [];
  constructor() {
    this.loadSession();
    if (this._session) {
      this.refreshToken();
    }
  }

  onSessionChange(listener: () => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private _notify() {
    for (const l of this._listeners) l();
  }

  get signedIn(): boolean {
    return this._session !== null;
  }

  get account(): LceOnlineAccount | null {
    return this._session?.account || null;
  }

  get displayUsername(): string {
    if (!this._session) return "Not signed in";
    return (
      this._session.account.displayName ||
      this._session.account.username ||
      "Unknown"
    );
  }

  get accessToken(): string | null {
    return this._session?.accessToken || null;
  }

  logoutLocal(): void {
    this._session = null;
    this.saveSession();
    this._notify();
  }

  async login(username: string, password: string): Promise<void> {
    const res = await this.request<string>(
      "POST",
      "/login",
      `${username}:${password}`,
      AUTH_BASE_URL,
    );
    const text = typeof res === "string" ? res : "";
    if (!text.startsWith("-")) {
      throw new Error(text || "Login failed");
    }
    const token = text.split(":")[1];
    await this.loginWithTokenAndFetchAccount(token);
  }

  async register(username: string, password: string): Promise<void> {
    const res = await this.request<string>(
      "POST",
      "/register",
      `${username}:${password}`,
      AUTH_BASE_URL,
    );
    const text = typeof res === "string" ? res : "";
    if (!text.startsWith("-")) {
      throw new Error(text || "Registration failed");
    }
    const token = text.split(":")[1];
    await this.loginWithTokenAndFetchAccount(token);
  }

  loginWithToken(token: string, username?: string) {
    const name = username || "Player";
    this._session = {
      accessToken: token,
      account: { username: name, displayName: name },
    };
    this.saveSession();
    this._notify();
  }

  async loginWithTokenAndFetchAccount(token: string): Promise<void> {
    this._session = {
      accessToken: token,
      account: { username: "Player", displayName: "Player" },
    };
    this.saveSession();
    this._notify();
    try {
      const raw: string = await this.request<string>("POST", "/accountinfo");
      if (typeof raw === "string" && raw.startsWith("-")) {
        const username = raw.slice(1);
        this._session!.account = { username, displayName: username };
        this.saveSession();
        this._notify();
      }
    } catch (e) {
      console.warn("Failed to fetch account info", e);
    }
  }

  private loadSession() {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (data) {
        this._session = JSON.parse(data);
      }
    } catch (e) {
      console.warn("Failed to load LCE Online session", e);
    }
  }

  private saveSession() {
    if (this._session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(this._session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: string | null,
    baseUrl?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "text/plain, application/json",
      "User-Agent": "MCLCE-LCEOnline/1.0",
    };

    if (body) {
      headers["Content-Type"] = "text/plain";
    }

    if (this._session?.accessToken) {
      headers["Authorization"] = `Bearer ${this._session.accessToken}`;
    }

    const url = `${baseUrl || this.baseUrl}${path}`;
    let res;
    try {
      res = await TauriService.httpProxyRequest(
        method,
        url,
        body ?? null,
        headers,
      );
    } catch (e) {
      throw new Error(`Network error when calling ${path}: ${e}`);
    }

    let data;
    try {
      data = res.body ? JSON.parse(res.body) : {};
    } catch {
      data = res.body ?? {};
    }

    if (res.status >= 400) {
      const errorMsg =
        data.message ||
        data.detail ||
        data.title ||
        data.error ||
        data ||
        `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  async refreshToken(): Promise<boolean> {
    if (!this._session) return false;

    try {
      const res = await this.request<string>("POST", "/refreshtoken", null, AUTH_BASE_URL);
      if (typeof res === "string" && res.startsWith("-")) {
        const [username, token] = res.slice(1).split(":");
        this._session.accessToken = token;
        this._session.account = { username, displayName: username };
        this.saveSession();
        this._notify();
        return true;
      }
      this.logoutLocal();
      return false;
    } catch (e) {
      console.warn("Failed to refresh token", e);
      this.logoutLocal()
      return false;
    }
  }

  async getSocialLists(): Promise<{
    friends: string[];
    requests: string[];
    blocked: string[];
  }> {
    const raw: string = await this.request<string>(
      "POST",
      "/getSocialLists",
      null,
    );
    if (typeof raw !== "string") {
      return { friends: [], requests: [], blocked: [] };
    }
    const withoutPrefix = raw.startsWith("-") ? raw.slice(1) : raw;
    const parts = withoutPrefix.split("|");
    return {
      friends: parts[0] ? parts[0].split(",").filter(Boolean) : [],
      requests: parts[1] ? parts[1].split(",").filter(Boolean) : [],
      blocked: parts[2] ? parts[2].split(",").filter(Boolean) : [],
    };
  }

  async sendFriendRequest(target: string): Promise<void> {
    const res = await this.request<string>("POST", "/sendrequest", target);
    if (typeof res === "string" && res !== "Successfully Sent Friend Request") {
      throw new Error(res);
    }
  }

  async acceptFriendRequest(from: string): Promise<void> {
    const res = await this.request<string>("POST", "/acceptrequest", from);
    if (typeof res === "string" && res !== "1") {
      throw new Error(res);
    }
  }

  async declineFriendRequest(from: string): Promise<void> {
    const res = await this.request<string>("POST", "/declinerequest", from);
    if (typeof res === "string" && res !== "1") {
      throw new Error(res);
    }
  }

  async removeFriend(from: string): Promise<void> {
    const res = await this.request<string>("POST", "/removefriend", from);
    if (typeof res === "string") {
      throw new Error(res);
    }
  }

  async sendInvite(target: string): Promise<void> {
    const res = await this.request<string>("POST", "/invite", target);
    if (typeof res === "string" && res !== "Invite Sent") {
      throw new Error(res);
    }
  }

  async acceptInvite(from: string): Promise<string> {
    const res = await this.request<string>("POST", "/acceptinvite", from);
    if (typeof res !== "string") throw new Error("Failed to accept invite");
    return res;
  }

  async declineInvite(from: string): Promise<void> {
    try {
      await this.request("POST", "/declineinvite", from);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg !== "Declined Invite") throw e;
    }
  }

  async getInvites(): Promise<
    Array<{
      inviteid: string;
      from: { uuid: string; username: string };
      sessionid: string;
    }>
  > {
    const res = await this.request<string>("GET", "/getinvites", null);
    return Array.isArray(res) ? res : [];
  }
}

export const lceOnlineService = new LceOnlineService();
