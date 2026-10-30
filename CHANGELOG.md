# @pgbeam/pulumi

## 0.4.0

### Minor Changes

- adb5b67: Add the `last4` and `email_domain` partial mask kinds to masking rules. `last4` returns `****` plus the value's last four characters, and `email_domain` returns `****@` plus the domain. A value too short for `last4`, or one whose text after its last `@` is not a hostname or bracketed IP address under `email_domain`, is redacted instead.

### Patch Changes

- Updated dependencies [adb5b67]
  - pgbeam@0.8.0

## 0.3.1

### Patch Changes

- Updated dependencies [0cf6810]
  - pgbeam@0.7.1

## 0.3.0

### Minor Changes

- 796f4a7: Policy profiles carry `query_mode` (`sql` or `templates`). A profile set to `templates` admits only the project's enabled query templates, and every other rule on the profile still applies to what a template runs. Setting `templates` is refused when the project has no enabled template, and while the organization has a live self-hosted enrollment. On update, an omitted `query_mode` keeps the stored mode. In Terraform, Crossplane and Pulumi, removing `query_mode` from a config plans `sql`, and the plan shows that change.

### Patch Changes

- Updated dependencies [796f4a7]
  - pgbeam@0.7.0

## 0.2.0

### Minor Changes

- d651ca6: Query templates can be declared as code: `pgbeam_query_template`, the Crossplane `QueryTemplate` and the Pulumi `QueryTemplate`. Removing `description`, `include_sql`, `enabled` or `params` from a config resets it to the API default (empty, false, true, none) rather than keeping the last value. The query template input's `description` now declares its default (empty) in the contract, which is what the API already stored for an omitted one. Nothing restricts a credential to templates yet: the policy profile setting that does arrives in a later release.

### Patch Changes

- Updated dependencies [5dbe64b]
- Updated dependencies [b2fdcfd]
- Updated dependencies [21e87a0]
- Updated dependencies [d651ca6]
- Updated dependencies [ca0bb93]
  - pgbeam@0.6.0

## 0.1.48

### Patch Changes

- 2d61633: An API key passed to `configure()` is now captured as a Pulumi secret, so the serialized provider in each resource's `__provider` state is encrypted instead of holding the key as readable text. `configure()` also accepts a secret `Output`, for example `config.requireSecret("pgbeamApiKey")`. `verifyCustomDomain` still works after `configure()`: it resolves the key asynchronously instead of reading it synchronously, which Pulumi forbids during update or preview.
- 2635ad3: `pulumi refresh` now drops a resource that was deleted outside Pulumi, so the next `pulumi up` recreates it. Before, resources with adoption config kept the stale state forever and the rest failed the refresh. Re-adoption by name now pages through the whole list instead of only the first 100 entries.
- Updated dependencies [ba058a7]
- Updated dependencies [acb171b]
- Updated dependencies [f363bd7]
- Updated dependencies [94466c2]
- Updated dependencies [958f25c]
- Updated dependencies [6cd15fe]
- Updated dependencies [289e0d3]
  - pgbeam@0.5.0

## 0.1.47

### Patch Changes

- c1888e5: Release the AnomalyRule and ApprovalRule resources, which were added without a provider version bump.

## 0.1.46

### Patch Changes

- Updated dependencies [14df323]
  - pgbeam@0.4.21

## 0.1.45

### Patch Changes

- b996a1b: An `allowedCidrs` entry without a `label` no longer stores the label "undefined", and an unset `poolConfig.maxActive`, `queryTimeoutMs` or `autoReadRouting` is now left out of the request instead of being sent as `null` or `false`.
- Updated dependencies [eb77c5f]
- Updated dependencies [9d6807d]
- Updated dependencies [d92dcdb]
  - pgbeam@0.4.20

## 0.1.44

### Patch Changes

- Updated dependencies [b821f90]
  - pgbeam@0.4.19

## 0.1.43

### Patch Changes

- Updated dependencies [16ed7f3]
  - pgbeam@0.4.18

## 0.1.42

### Patch Changes

- Updated dependencies [a9c235e]
  - pgbeam@0.4.17

## 0.1.41

### Patch Changes

- Updated dependencies [40af2fb]
  - pgbeam@0.4.16

## 0.1.40

### Patch Changes

- Updated dependencies [631f106]
  - pgbeam@0.4.15

## 0.1.39

### Patch Changes

- Updated dependencies [a5fbfca]
  - pgbeam@0.4.14

## 0.1.38

### Patch Changes

- 3342c65: feat(policy): content_scan_mode and content_scan_max_bytes on the policy profile
- Updated dependencies [3342c65]
  - pgbeam@0.4.13

## 0.1.37

### Patch Changes

- Updated dependencies [3f33063]
- Updated dependencies [022577d]
- Updated dependencies [eca3f27]
- Updated dependencies [c1fa878]
- Updated dependencies [9818ecf]
- Updated dependencies [3f33063]
  - pgbeam@0.4.12

## 0.1.36

### Patch Changes

- Updated dependencies [bd2d132]
- Updated dependencies [58d0ed0]
- Updated dependencies [43acb8e]
- Updated dependencies [379b817]
- Updated dependencies [7a26954]
- Updated dependencies [8deebf2]
- Updated dependencies [43acb8e]
  - pgbeam@0.4.11

## 0.1.35

### Patch Changes

- Updated dependencies [8b04b38]
  - pgbeam@0.4.10

## 0.1.34

### Patch Changes

- Updated dependencies [dd2e970]
  - pgbeam@0.4.9

## 0.1.33

### Patch Changes

- da78ed3: Declare a deliberate `@pulumi/pulumi` peer floor of `^3.229.0` rather than republishing whatever version shipped that week. A consumer on any Pulumi 3.x from 3.229.0 up can install the provider.
- Updated dependencies [6bf2e14]
  - pgbeam@0.4.8

## 0.1.32

### Patch Changes

- Updated dependencies [d3cce03]
  - pgbeam@0.4.7

## 0.1.31

### Patch Changes

- Updated dependencies [d3cce03]
  - pgbeam@0.4.6

## 0.1.30

### Patch Changes

- Updated dependencies [d3cce03]
  - pgbeam@0.4.5

## 0.1.29

### Patch Changes

- Updated dependencies [eb3390d]
  - pgbeam@0.4.4

## 0.1.28

### Patch Changes

- Updated dependencies [d5149ba]
  - pgbeam@0.4.3

## 0.1.27

### Patch Changes

- Updated dependencies [89e2f33]
  - pgbeam@0.4.2

## 0.1.26

### Patch Changes

- Updated dependencies [08071bd]
  - pgbeam@0.4.1

## 0.1.25

### Patch Changes

- 2d6e1ee: Bound every API call with a timeout and a retry budget, and report what failed.

  `fetcher` now aborts an attempt after `timeoutMs` (default 30s, `0` disables it) and stops retrying once `RetryConfig.totalBudgetMs` (default 120s) is spent, so a long backoff ladder against a service that is down cannot outlive the budget. A request that never got an answer throws a `NetworkError` naming the method, URL, attempt count and elapsed time, with the `cause` chain flattened by the new `describeError` export instead of an opaque `TypeError: fetch failed`.

  The Pulumi provider uses a 15s request timeout and a 60s total budget, down from an unbounded ladder that could spend over five minutes before failing. Its generated `read()` now keeps the last known state when the API gave no considered answer (a refused or timed-out connection, or a gateway status), because a refresh that could not observe a resource has not found drift. Anything the API actually answered still fails the run.

- Updated dependencies [2d6e1ee]
  - pgbeam@0.4.0

## 0.1.24

### Patch Changes

- Updated dependencies [d78ddfc]
  - pgbeam@0.3.14

## 0.1.23

### Patch Changes

- Updated dependencies [19fd607]
  - pgbeam@0.3.13

## 0.1.22

### Patch Changes

- Updated dependencies [06f9609]
  - pgbeam@0.3.12

## 0.1.21

### Patch Changes

- Updated dependencies [31cb990]
  - pgbeam@0.3.11

## 0.1.20

### Patch Changes

- 5d49e15: feat(providers): SelfHostEnrollment resource in all three IaC providers, gateway-resource secret-lifecycle tests, crossplane generator fix for immutable resources with wrapped create responses
- Updated dependencies [19a6caf]
  - pgbeam@0.3.10

## 0.1.19

### Patch Changes

- Updated dependencies [642b681]
  - pgbeam@0.3.9

## 0.1.18

### Patch Changes

- Updated dependencies [0db5320]
- Updated dependencies [18d777f]
- Updated dependencies [fae176d]
  - pgbeam@0.3.8

## 0.1.17

### Patch Changes

- Updated dependencies [320102e]
  - pgbeam@0.3.7

## 0.1.16

### Patch Changes

- Updated dependencies [bb681f4]
  - pgbeam@0.3.6

## 0.1.15

### Patch Changes

- Updated dependencies [615a24f]
  - pgbeam@0.3.5

## 0.1.14

### Patch Changes

- Updated dependencies [a369073]
  - pgbeam@0.3.4

## 0.1.13

### Patch Changes

- Updated dependencies [602fe55]
  - pgbeam@0.3.3

## 0.1.12

### Patch Changes

- Updated dependencies [f2d1f56]
  - pgbeam@0.3.2

## 0.1.11

### Patch Changes

- Updated dependencies [b1d406d]
  - pgbeam@0.3.1

## 0.1.10

### Patch Changes

- Updated dependencies [728a7a5]
  - pgbeam@0.3.0

## 0.1.9

### Patch Changes

- Updated dependencies [ed8238a]
  - pgbeam@0.2.9

## 0.1.8

### Patch Changes

- Updated dependencies [4761ffe]
  - pgbeam@0.2.8

## 0.1.7

### Patch Changes

- Updated dependencies [6ba336f]
  - pgbeam@0.2.7

## 0.1.6

### Patch Changes

- Updated dependencies [46b2b4b]
- Updated dependencies [bc47c25]
  - pgbeam@0.2.6

## 0.1.5

### Patch Changes

- Updated dependencies [7d6e350]
  - pgbeam@0.2.5

## 0.1.4

### Patch Changes

- Updated dependencies [bbab027]
  - pgbeam@0.2.4

## 0.1.3

### Patch Changes

- Updated dependencies [0115d96]
- Updated dependencies [1dfa672]
  - pgbeam@0.2.3

## 0.1.2

### Patch Changes

- 4ddbec1: Remove runtime dependency on @swc/helpers by bumping tsconfig target to ES2022
- Updated dependencies [4ddbec1]
  - pgbeam@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [6583d1a]
  - pgbeam@0.2.1
