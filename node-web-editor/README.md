# WF Patch Studio

Node.js web tool for making World Flipper data patches online. It mirrors the Python mod-tools patch flow without requiring Python at runtime:

1. Resolve logical master-data paths with the same salted SHA1 rule.
2. Read and write CDN `orderedmap` files with the same zlib index and row encoding.
3. Save table changes with backups and append the changed hash path to `work/sync_pending.json`.
4. Publish pending files into official-style diff zips under `.cdn/cn/archive-*-diff`.

No npm dependencies are required for the current implementation.

## Start

```bash
bash scripts/start-patch-studio.sh
```

Useful environment variables:

| Variable | Description |
|---|---|
| `WF_WEB_HOST` | Bind host, default `127.0.0.1`. |
| `WF_WEB_PORT` | HTTP port, default `8787`. |
| `WF_PROFILE` | Profile id from `../profiles.json`. |
| `WF_TARGET_STORE` | Target `production/upload` directory. Overrides profile. |
| `WF_SOURCE_STORE` | Optional full source upload store used as fallback. |
| `WF_COMMON_FULL_DIR` | Optional directory containing `archive-common-full/*.zip`; default is `$WF_CDN_DIR/archive-common-full`. |
| `WF_CDN_DIR` | CDN root, normally `.cdn/cn`. |

Open:

```text
http://127.0.0.1:8788
```

The integrated `startpoint-cn` checkout defaults to:

- `WF_DATA_ROOT=<repo>`
- `WF_TARGET_STORE=<repo>/.cdn/cn/production/upload`
- `WF_CDN_DIR=<repo>/.cdn/cn`

For a custom checkout, use:

```bash
WF_DATA_ROOT=/root/wf/startpoint-cn \
WF_TARGET_STORE=/root/wf/startpoint-cn/.cdn/cn/production/upload \
WF_CDN_DIR=/root/wf/startpoint-cn/.cdn/cn \
node node-web-editor/server.js
```

`production/upload` is treated as the writable overlay. If a table is not present there, the tool reads it directly from `archive-common-full/*.zip` and writes the modified table back into `production/upload`.

## Current Scope

- Standard CSV row orderedmaps can be viewed, edited by row text, or edited by single CSV cell.
- Nested orderedmap tables such as `character_status`, `action_skill`, `rush_event_quest`, and battle tables can be viewed and edited by nested CSV cell.
- Direct raw outer-row text editing is intentionally blocked to avoid corrupting nested orderedmap bytes.
- Publishing creates `pinball-<from>-<to>-1-mod<tag>.zip` and stamps `work/changelog.jsonl` entries with the published version.

## Client Update Flow

Publishing only writes the diff zip into `.cdn/cn/archive-*-diff`; the game client learns about it through the CN CDN `/get_path` response. The server scans `archive-common-diff`, `archive-medium-diff`, and `archive-android-diff`, parses `pinball-<from>-<to>-...zip`, and returns those archives in the `diff` list.
