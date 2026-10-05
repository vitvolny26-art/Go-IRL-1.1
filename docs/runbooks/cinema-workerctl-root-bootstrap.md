# Cinema workerctl one-time root bootstrap

This bootstrap exists only to cross the initial trust boundary where the VPS still has an older root-owned `go-irl-cinema-workerctl` that does not expose the bounded `install-helper` action.

## Preconditions

- The authorized release is merged to GitHub `main`.
- CI for that exact merged SHA is green.
- A root operator has an exact checkout of that SHA on the VPS.
- The checkout is not substituted with an arbitrary file copy.

## Root command

Run only from a root-authorized operator session:

```sh
ops/bootstrap/bootstrap-cinema-workerctl <40-char-exact-merged-main-sha> <absolute-checkout-path>
```

The script fails closed unless the checkout HEAD equals the supplied SHA. It installs only `ops/workerctl/go-irl-cinema-workerctl` to the fixed target `/usr/local/sbin/go-irl-cinema-workerctl`, root:root mode 0755, then verifies `preflight`, `install-helper`, and `probe-source`.

It does not install sudoers, rewrite environment/config, restart services, deploy the worker runtime, access secrets, or publish data.

After a successful one-time bootstrap, normal Cinema Worker Install runs can update the helper through its bounded `install-helper` action.
