# @pgbeam/pulumi

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

  `fetcher` now aborts an attempt after `timeoutMs` (default 30s, `0` disables it)
  and stops retrying once `RetryConfig.totalBudgetMs` (default 120s) is spent, so a
  long backoff ladder against a service that is down cannot outlive the budget. A
  request that never got an answer throws a `NetworkError` naming the method, URL,
  attempt count and elapsed time, with the `cause` chain flattened by the new
  `describeError` export instead of an opaque `TypeError: fetch failed`.

  The Pulumi provider uses a 15s request timeout and a 60s total budget, down from
  an unbounded ladder that could spend over five minutes before failing. Its
  generated `read()` now keeps the last known state when the API gave no considered
  answer (a refused or timed-out connection, or a gateway status), because a
  refresh that could not observe a resource has not found drift. Anything the API
  actually answered still fails the run.

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

- 4ddbec1: Remove runtime dependency on @swc/helpers by bumping tsconfig target
  to ES2022
- Updated dependencies [4ddbec1]
  - pgbeam@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [6583d1a]
  - pgbeam@0.2.1
