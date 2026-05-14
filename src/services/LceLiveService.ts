const LOCAL_STORAGE_KEY = "lcelive_session";
const DEFAULT_BASE_URL = "https://api.lcelive.co.uk";
const MAX_REFRESH_RETRIES = 1;
import { TauriService } from "./TauriService";
export interface LceLiveAccount {
  accountId: string;
  username: string;
  displayName: string;
}

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  account: LceLiveAccount;
}

export interface DeviceLinkStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  intervalSeconds: number;
  expiresInSeconds?: number;
}

export interface DeviceLinkPollResponse {
  status: string;
  isLinked?: boolean;
  accessToken?: string;
  refreshToken?: string;
  account?: LceLiveAccount;
}

export interface GameInvite {
  inviteId: string;
  from: LceLiveAccount | string;
  hostIp: string;
  hostPort: number;
  hostName: string;
  signalingSessionId?: string;
  status: string;
}

export interface FriendRequest {
  accountId: string;
  username: string;
  displayName: string;
}

export interface PendingRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export class LceLiveService {
  private _session: SessionData | null = null;
  private baseUrl: string = DEFAULT_BASE_URL;
  private _refreshPromise: Promise<void> | null = null;

  constructor() {
    this.loadSession();
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  get signedIn(): boolean {
    return this._session !== null;
  }

  get account(): LceLiveAccount | null {
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

  get apiBaseUrl(): string {
    return this.baseUrl;
  }

  get accessToken(): string | null {
    return this._session?.accessToken || null;
  }

  public generateDeviceId(): string {
    let id = localStorage.getItem("lcelive_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("lcelive_device_id", id);
    }
    return id;
  }

  public getDeviceName(): string {
    return "LCE Emerald Launcher";
  }

  private loadSession() {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (data) {
        this._session = JSON.parse(data);
      }
    } catch (e) {
      console.warn("Failed to load LceLive session", e);
    }
  }

  private saveSession() {
    if (this._session) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this._session));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  private async performAuthenticatedRequest(
    method: string,
    path: string,
    bodyStr: string | null,
    retryCount: number = 0,
  ): Promise<{ status: number; body: string }> {
    const accessToken = this._session?.accessToken;
    if (!accessToken) {
      throw new Error("Not signed in to LCELive.");
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "MCLCE-LceLive/1.0",
      Authorization: `Bearer ${accessToken}`,
    };
    if (bodyStr) {
      headers["Content-Type"] = "application/json";
    }

    let res: { status: number; body: string };
    try {
      res = await TauriService.httpProxyRequest(
        method,
        `${this.baseUrl}${path}`,
        bodyStr,
        headers,
      );
    } catch (e) {
      throw new Error(`Network error when calling ${path}: ${e}`);
    }

    if (
      res.status === 401 &&
      this._session?.refreshToken &&
      retryCount < MAX_REFRESH_RETRIES
    ) {
      try {
        await this.refreshSession();
        return this.performAuthenticatedRequest(
          method,
          path,
          bodyStr,
          retryCount + 1,
        );
      } catch (err) {
        this.logoutLocal();
        throw new Error("Session expired. Please log in again.");
      }
    }

    return res;
  }

  private async request(
    method: string,
    path: string,
    body?: any,
    authed: boolean = true,
  ): Promise<any> {
    const bodyStr = body ? JSON.stringify(body) : null;

    let res: { status: number; body: string };
    if (authed) {
      res = await this.performAuthenticatedRequest(method, path, bodyStr);
    } else {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "MCLCE-LceLive/1.0",
      };
      if (bodyStr) {
        headers["Content-Type"] = "application/json";
      }

      try {
        res = await TauriService.httpProxyRequest(
          method,
          `${this.baseUrl}${path}`,
          bodyStr,
          headers,
        );
      } catch (e) {
        throw new Error(`Network error when calling ${path}: ${e}`);
      }
    }

    let data;
    try {
      data = res.body ? JSON.parse(res.body) : {};
    } catch {
      data = { message: res.body };
    }

    if (res.status >= 400) {
      const errorMsg =
        data.message ||
        data.detail ||
        data.title ||
        data.error ||
        `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  async startDeviceLink(): Promise<DeviceLinkStartResponse> {
    return this.request(
      "POST",
      "/api/auth/device/start",
      {
        deviceId: this.generateDeviceId(),
        deviceName: this.getDeviceName(),
      },
      false,
    );
  }

  async pollDeviceLink(deviceCode: string): Promise<DeviceLinkPollResponse> {
    const data = await this.request(
      "GET",
      `/api/auth/device/poll/${deviceCode}`,
      null,
      false,
    );
    if (data.isLinked && data.accessToken) {
      this._session = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        account: data.account,
      };
      this.saveSession();
    }
    return data;
  }

  async refreshSession(): Promise<void> {
    if (!this._session?.refreshToken) throw new Error("No refresh token");

    if (this._refreshPromise) {
      return this._refreshPromise;
    }

    this._refreshPromise = (async () => {
      try {
        const data = await this.request(
          "POST",
          "/api/auth/refresh",
          {
            refreshToken: this._session!.refreshToken,
          },
          false,
        );
        this._session = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          account: data.account,
        };
        this.saveSession();
      } finally {
        this._refreshPromise = null;
      }
    })();

    return this._refreshPromise;
  }

  async logout(): Promise<void> {
    if (this._session?.refreshToken) {
      try {
        await this.request(
          "POST",
          "/api/auth/logout",
          {
            refreshToken: this._session.refreshToken,
          },
          true,
        );
      } catch (e) {
        console.warn("Server logout failed", e);
      }
    }
    this.logoutLocal();
  }

  logoutLocal(): void {
    this._session = null;
    this.saveSession();
  }

  async getFriends(): Promise<LceLiveAccount[]> {
    const data = await this.request("GET", "/api/social/friends");
    return data.friends || [];
  }

  async removeFriend(accountId: string): Promise<void> {
    await this.request("DELETE", `/api/social/friends/${accountId}`);
  }

  async sendFriendRequest(username: string): Promise<void> {
    await this.request("POST", "/api/social/request", { username });
  }

  async getPendingRequests(): Promise<PendingRequests> {
    const data = await this.request("GET", "/api/social/requests");
    return {
      incoming: (data.incoming || []).map((r: any) => ({
        accountId: r.requesterUserId || r.accountId || r.userId,
        username: r.requesterUsername || r.username,
        displayName: r.requesterDisplayName || r.displayName,
      })),
      outgoing: (data.outgoing || []).map((r: any) => ({
        accountId: r.targetUserId || r.accountId || r.userId,
        username: r.targetUsername || r.username,
        displayName: r.targetDisplayName || r.displayName,
      })),
    };
  }

  async acceptFriendRequest(accountId: string): Promise<void> {
    await this.request("POST", `/api/social/requests/${accountId}/accept`, {});
  }

  async declineFriendRequest(accountId: string): Promise<void> {
    await this.request("POST", `/api/social/requests/${accountId}/decline`, {});
  }

  async getGameInvites(): Promise<GameInvite[]> {
    const data = await this.request("GET", "/api/sessions/invites");
    const incoming = data.incoming || [];
    return incoming.map((inv: any) => ({
      inviteId: inv.inviteId,
      from: {
        accountId: inv.senderAccountId,
        username: inv.senderUsername,
        displayName: inv.senderDisplayName,
      },
      hostIp: inv.hostIp,
      hostPort: inv.hostPort,
      hostName: inv.hostName,
      status: inv.status,
      signalingSessionId: inv.signalingSessionId,
    }));
  }

  async sendGameInvite(
    recipientAccountId: string,
    hostIp: string,
    hostPort: number,
    hostName: string,
    signalingSessionId?: string,
  ): Promise<void> {
    await this.request("POST", "/api/sessions/invites", {
      recipientAccountId,
      hostIp,
      hostPort,
      hostName,
      signalingSessionId,
    });
  }

  async acceptGameInvite(inviteId: string): Promise<any> {
    return this.request("POST", `/api/sessions/invites/${inviteId}/accept`, {});
  }

  async declineGameInvite(inviteId: string): Promise<void> {
    await this.request("POST", `/api/sessions/invites/${inviteId}/decline`, {});
  }

  async deactivateGameInvites(): Promise<void> {
    await this.request("POST", "/api/sessions/invites/deactivate", {});
  }

  async requestJoinTicket(): Promise<string> {
    const data = await this.request("POST", "/api/sessions/ticket", {});
    return data.ticket;
  }

  async validateJoinTicket(ticket: string): Promise<LceLiveAccount> {
    return this.request("POST", "/api/sessions/validate", { ticket }, false);
  }
}

export const lceLiveService = new LceLiveService();
