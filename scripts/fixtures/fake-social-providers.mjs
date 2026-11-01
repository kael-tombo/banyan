// Stand-in LinkedIn + X for local and CI integration runs (scripts/socialflow-integration-check.ts).
// Consent is auto-approved; every post is recorded and readable at GET /__log. Not a real provider.
import http from "node:http";
const port = Number(process.argv[2]);
const xCallback = process.argv[3];
const log = { linkedinPosts: [], tweets: [], calls: [] };
const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    log.calls.push(`${req.method} ${u.pathname}`);
    const key = `${req.method} ${u.pathname}`;
    if (key === "GET /__log") return send(res, 200, JSON.stringify(log), { "content-type": "application/json" });
    if (key === "GET /oauth/v2/authorization") {
      const back = new URL(u.searchParams.get("redirect_uri"));
      back.searchParams.set("code", "good-code"); back.searchParams.set("state", u.searchParams.get("state"));
      return send(res, 302, "", { location: back.toString() });
    }
    if (key === "POST /oauth/v2/accessToken") return send(res, 200, JSON.stringify({ access_token: "li-token", expires_in: 5184000 }));
    if (key === "GET /v2/userinfo") return send(res, 200, JSON.stringify({ sub: "abc123", name: "Ada Founder" }));
    if (key === "POST /rest/posts") {
      log.linkedinPosts.push({ body: JSON.parse(body), version: req.headers["linkedin-version"] });
      return send(res, 201, "", { "x-restli-id": `urn:li:share:${7000 + log.linkedinPosts.length}` });
    }
    if (key === "POST /oauth/request_token") return send(res, 200, "oauth_token=rt&oauth_token_secret=rts&oauth_callback_confirmed=true");
    if (key === "GET /oauth/authorize") return send(res, 302, "", { location: `${xCallback}?oauth_token=rt&oauth_verifier=v1` });
    if (key === "POST /oauth/access_token") return send(res, 200, "oauth_token=at&oauth_token_secret=ats");
    if (key === "GET /2/users/me") return send(res, 200, JSON.stringify({ data: { id: "42", name: "Ada", username: "ada" } }));
    if (key === "POST /2/tweets") {
      const t = JSON.parse(body); log.tweets.push(t);
      return send(res, 201, JSON.stringify({ data: { id: `t${log.tweets.length}`, text: t.text } }));
    }
    send(res, 404, "{}");
  });
}).listen(port, "127.0.0.1", () => console.log(`fake providers on ${port}`));
