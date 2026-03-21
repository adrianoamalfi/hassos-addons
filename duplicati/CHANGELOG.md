<!-- https://developers.home-assistant.io/docs/add-ons/presentation#keeping-a-changelog -->

## 1.1.1

- ⬆️ Update Duplicati to v2.2.0.107 (2026-03-20)

## 1.1.0

- feat ✨: Add nginx reverse proxy for HA ingress (fixes connectivity and auth issues)
- feat ✨: Support both new UI (ngclient) and legacy UI (ngax) through ingress
- feat ✨: Add automated container startup and health check tests in CI
- chore 📦: Remove duplicati-dev and duplicati-local variants (single addon)
- chore 📦: Simplify CI/CD workflows and development scripts

## 1.0.0

- feat ✨: **BREAKING** Migrate from Mono to native .NET runtime
- feat ✨: Update Duplicati to v2.2.0.106 (canary channel)
- feat ✨: Self-contained architecture-specific binaries (no more Mono dependency)
- feat ✨: Add duplicati-dev addon for testing
- feat ✨: Add local development scripts (check-updates, bump-version, local-build, local-test)
- feat ✨: Add automated release workflow and Duplicati update checker
- chore 📦: Modernize CI/CD (actions/checkout v6, docker/login-action v4, builder 2026.02.1)
- chore 📦: Replace deprecated ::set-output with $GITHUB_OUTPUT
- chore 📦: Replace archived jitterbit/get-changed-files with native git diff
- fix 🐛: Remove DST Root CA X3 workaround (Mono-specific, no longer needed)
- fix 🐛: Customize AppArmor profile for Duplicati (was generic template)
- 🖥️ Drop 32-bit architectures (armhf, armv7, i386) deprecated by HA builder

## 0.2.0
- ✔️ Update Duplicati to v2.0.8.1-1
- feat ✨: Update Docker image references for Duplicati Add-on to use la… 
- feat ✨: Update Duplicati add-on config to v0.2.0, adds aarch64 support
- ✔️ Update Duplicati to v2.0.7.2-2.0.7.2_canary_2023-05-25
- ⬆️ build(deps): bump actions/checkout from 4.1.2 to 4.1.7
- ⬆️ build(deps): bump docker/login-action from 3.1.0 to 3.2.0

## 0.1.13

- ✔️ Update Duplicati to v2.0.7.103_canary_2024-04-19
- ⬆️ build(deps): bump home-assistant/builder from 2023.08.0 to 2024.03.5 by @dependabot in #52
- ⬆️ build(deps): bump actions/checkout from 3.6.0 to 4.1.2 by @dependabot in #51
- ⬆️ build(deps): bump docker/login-action from 2.2.0 to 3.1.0 by @dependabot in #50
- ⬆️ build(deps): bump frenck/action-addon-linter from 2.13 to 2.15 by @dependabot in #47
- ⬆️ modified: duplicati/config.yaml by @adrianoamalfi in #53

## 0.1.12

- ✔️ Fix Backblaze B2 Cloud Storage
- ⬆️ bump actions/checkout from 3.5.2 to 3.6.0
- ⬆️ bump home-assistant/builder from 2023.03.0 to 2023.08.0
- ⬆️ bump docker/login-action from 2.1.0 to 2.2.0

## 0.1.11

- ✔️ Update Duplicati to v2.0.7.2-2.0.7.2_canary_2023-05-25
- ⬆️ bump frenck/action-addon-linter from 2.11 to 2.13

## 0.1.10

- ✔️ Update Duplicati to v2.0.6.105-2.0.6.105_canary_2023-04-09
- ⬆️ build(deps): bump actions/checkout from 3.3.0 to 3.5.2
- ⬆️ build(deps): bump home-assistant/builder from 2022.11.0 to 2023.03.0
- 🖥️ Debian Base Image 6.2.5

## 0.1.9

- build(deps): bump frenck/action-addon-linter from 2.10 to 2.11
- build(deps): bump actions/checkout from 3.2.0 to 3.3.0

## 0.1.8

- ✔️ Update Duplicati to v2.0.6.104-2.0.6.104_canary_2022-06-15
- 🖥️ Debian Base Image 6.2.0

## 0.1.7

- ✔️ Update Duplicati to v2.0.6.3-2.0.6.3_beta_2021-06-17
- 🖥️ Debian Base Image 6.1.1
  ⬆️ Upgrades Debian to Bullseye 20221205

## 0.1.6

- ✔️ bump home-assistant/builder from 2022.09.0 to 2022.11.0
- What's Changed: Add support for arch specifc dockerfiles (#160) @​pvizeli / Bump docker/login-action from 2.0.0 to 2.1.0 (#157) @​dependabot

## 0.1.5

- ✔️ bump home-assistant/builder from 2022.07.0 to 2022.09.0

## 0.1.4

- 🖥️ Debian Base Image 6.1.1

## 0.1.3

## 0.1.2

- 🖥️ Debian Base Image 6.1.0

## 0.1.2

- 🖥️ Add aarch64, i386 compatibility
- 🖥️ Debian Base Image 6.0.0
- 🧑‍💻Mono Version 6.12.0.182
- ✔️Add read-write on Hassio folder for restore operations

## 0.1.1

- Remove config

## 0.1.0

- Development Initial Version