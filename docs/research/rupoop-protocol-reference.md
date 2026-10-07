# Rupoop as a RUTUBE protocol reference

- **Observed:** 2026-10-07 (Europe/Moscow)
- **Rupoop revision:** [`b1c6b57e37a2e5e8baddfc92e06e86e8993d344b`](https://github.com/santiago43rus/Rupoop/commit/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b), authored and committed 2026-10-05 23:06:53 +03:00
- **Scope:** source inspection and anonymous, read-only checks against public first-party RUTUBE endpoints. No Rupoop source was copied into this project.

## Conclusion

Rupoop is useful as evidence for a very small anonymous RUTUBE flow:

1. search public videos with `GET /api/search/video/`;
2. retain each result's `video_url` and metadata;
3. extract the video identifier;
4. request `GET /api/play/options/{id}/`;
5. pass `video_balancer.m3u8` to an adaptive HLS player.

It is **not** evidence for the official RUTUBE home feed, RUTUBE account authentication, RUTUBE-backed history/subscriptions, comments, or a recommendations API. Rupoop implements those experiences locally and optionally synchronizes them through a private GitHub Gist. Its “without ads” behavior is also not an explicit ad-removal algorithm: the application ignores the advertising fields/player orchestration returned by `play/options` and plays the HLS URL directly.

For the webOS client, the endpoint sequence and adapter boundaries are conceptually useful. The Android networking, playback, UI, lifecycle, background-service, and GitHub OAuth implementations are not portable.

## License

The pinned repository contains the [MIT License](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/LICENSE). It permits use, modification, redistribution, sublicensing, and sale, provided the copyright and permission notice remain in copies or substantial portions; it disclaims warranty and liability.

This report nevertheless treats Rupoop only as a behavioral reference. No code reuse is needed for the webOS implementation. If code is ever copied later, preserve the MIT notice and record the exact files and revision in the project notices.

## Observed Rupoop protocol surface

Rupoop declares only three RUTUBE HTTP operations: public video search, playback options, and videos for an author. The Retrofit definitions are in [`ApiInterfaces.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/network/ApiInterfaces.kt#L6-L24); the client uses `https://rutube.ru/` as its base URL and sends a custom user agent in [`RetrofitClient.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/network/RetrofitClient.kt#L10-L31).

| Capability | What Rupoop actually does | Evidence and portability |
| --- | --- | --- |
| Home | Selects up to four locally configured genres, turns them into search strings, calls the public search endpoint in parallel, deduplicates results, and applies its own recommender. “Load more” chooses a random page from 2–4. | This is not RUTUBE's editorial or personalized home API. The idea of composing a feed from searches is portable only as a fallback. See [`ContentFeedController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/ContentFeedController.kt#L48-L94). |
| Search | Calls `GET api/search/video/?format=json` with `query`, optional `ordering`, and `page`. Rupoop also performs multi-source search for VK, OK, and Lordfilm; those paths are outside this project's RUTUBE scope. Search suggestions come from Google's YouTube-flavoured suggestion endpoint, not RUTUBE. | The RUTUBE search request shape is conceptually reusable behind an undocumented-API adapter. The Google suggestion dependency should not be carried over. See [`ApiInterfaces.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/network/ApiInterfaces.kt#L6-L15) and [`SearchController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/SearchController.kt#L55-L78). |
| Details | Does not call a dedicated RUTUBE details endpoint. It carries the search result into the details/player UI. `play/options` contributes only the fields modeled by Rupoop: thumbnail, tags, and duration. | Do not infer that the search response is a stable or complete details contract. Rupoop's deliberately small model is visible in [`Models.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/Models.kt#L6-L42). |
| Source retrieval | Extracts an ID from `/video/{id}` or `/play/embed/{id}`, requests `GET api/play/options/{id}/?format=json`, reads `video_balancer.m3u8`, and passes that URL to the player. | The request sequence is the strongest reusable finding. ID parsing should be replaced with explicit URL parsing and supported-route tests. See [`UniversalVideoParser.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/parser/UniversalVideoParser.kt#L32-L45) and [`PlaybackController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/player/PlaybackController.kt#L267-L305). RUTUBE itself documents `api/play/options/{id_video}` as the source of player attributes in its [embed documentation](https://rutube.ru/info/embed/). |
| HLS | Models only `video_balancer.m3u8`; ExoPlayer receives the master URL and performs adaptive selection. | HLS is observed and conceptually reusable. Rupoop does not parse, rewrite, or classify the manifest. Its ExoPlayer/data-source setup is Android-specific; see [`PlaybackController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/player/PlaybackController.kt#L60-L84). |
| DASH/DRM | Has no DASH/MPD field, parser, or selection path in its RUTUBE data model. It also does not consume `drm_token`, entitlement, paid-content, or access-control fields from the current `play/options` response. | This is absence of implementation, not proof that RUTUBE never serves DASH or DRM. The webOS adapter must fail explicitly on unsupported sources and retain unknown-field fixtures. |
| Authentication | Uses GitHub OAuth with `gist` scope, an application callback, and a proxy-mediated token exchange. It does not authenticate to RUTUBE. | Not reusable as RUTUBE authentication. See [`GitHubAuthManager.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/auth/GitHubAuthManager.kt#L19-L57). RUTUBE's current Smart TV FAQ documents a six-digit TV code and `rutube.ru/activate/`, so any future login work should research that first-party device flow independently: [RUTUBE Smart TV FAQ](https://rutube.ru/info/androidtv/). |
| History | Adds and updates watch records in a local JSON registry, caps history at 500 entries, and optionally synchronizes that registry to a private GitHub Gist. | The local state model may inspire an anonymous/local profile, but it is not RUTUBE watch history. See [`UserRegistryManager.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/UserRegistryManager.kt#L12-L46) and [`GistSyncManager.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/auth/GistSyncManager.kt#L16-L39). RUTUBE documents account history under “Моё” in the [Smart TV FAQ](https://rutube.ru/info/androidtv/), but Rupoop does not use it. |
| Subscriptions | Stores a local list of authors. To construct the subscriptions feed, it calls `api/video/person/{authorId}/`, or falls back to search by author name, then filters client-side for an exact author-name match. The list is optionally Gist-synced. | The author-videos endpoint can be researched as a public catalog operation. Subscription state itself is not a RUTUBE subscription and should be named “local follows” if this pattern is adopted. See [`ContentFeedController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/ContentFeedController.kt#L97-L146). |
| Recommendations | Builds search queries from the current title, runs them through the platform's search engine, and ranks the returned candidates locally using title similarity, sequel heuristics, author match, history, and tag weights. The home recommender is also entirely local. | Useful as a product idea, not as evidence of RUTUBE's recommendation protocol. See [`PlaybackController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/player/PlaybackController.kt#L316-L340), [`RelatedVideoRecommendationStrategy.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/RelatedVideoRecommendationStrategy.kt#L223-L305), and [`MainFeedRecommendationStrategy.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/MainFeedRecommendationStrategy.kt#L11-L75). |
| Comments | No RUTUBE comments request, response model, repository, or UI was found in the pinned source. | Rupoop provides no protocol evidence. First-party RUTUBE material confirms comments exist on the service, but not a public consumer API: [RUTUBE Studio FAQ](https://rutube.ru/info/studioandroid/). Keep comments out of the MVP unless a supported interface is found. |
| Advertising | Does not initialize RUTUBE's embedded player, an ad SDK, VAST/YAST handling, or a manifest filter. It requests `play/options`, ignores its advertising-related fields, and plays `video_balancer.m3u8` directly. | Conceptually this shows that a direct content HLS was obtainable for sampled anonymous videos. It does **not** establish a durable or permitted ad-removal protocol. See [`Models.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/data/Models.kt#L6-L18) and [`PlaybackController.kt`](https://github.com/santiago43rus/Rupoop/blob/b1c6b57e37a2e5e8baddfc92e06e86e8993d344b/app/src/main/java/com/santiago43rus/rupoop/player/PlaybackController.kt#L267-L305). |

## Current first-party RUTUBE checks

The following anonymous observations were made on 2026-10-07 with no cookies, account, or authorization headers. Signed media URLs were neither printed nor stored.

### Search and author listing

- [`GET /api/search/video/?format=json&query=наука&page=1`](https://rutube.ru/api/search/video/?format=json&query=%D0%BD%D0%B0%D1%83%D0%BA%D0%B0&page=1) returned HTTP 200 with `count`, `has_next`, `next`, `previous`, `current_page`, and `results`. The sampled response contained 91 results. A result included the fields Rupoop depends on (`title`, `author`, `duration`, `thumbnail_url`, `created_ts`, `publication_ts`, `hits`, and `video_url`) plus additional availability and content-classification fields.
- The Rupoop author-list request shape was also reachable for a public author during the session. Because this endpoint is not documented in the reviewed first-party material, it remains an observed, undocumented dependency.
- Error bodies matter: some search results and the older video from RUTUBE's embed documentation returned structured `detail` stubs instead of playable options in this network/region. Source resolution must model “unavailable” separately from malformed JSON or network failure.

### Playback options and formats

- RUTUBE's first-party [embed API documentation](https://rutube.ru/info/embed/) explicitly identifies `https://rutube.ru/api/play/options/{id_video}` as the full source of player attributes.
- For playable public video `19a244acbe9a8aee985704844a8d0133`, [`play/options`](https://rutube.ru/api/play/options/19a244acbe9a8aee985704844a8d0133/?format=json) returned HTTP 200. `video_balancer` contained `default` and `m3u8`; the HLS URL used HTTPS and resolved to a RUTUBE/RTBCDN host. No `dash` or `mpd`-named field appeared in the top-level or `video_balancer` keys of this response.
- The response exposed substantially more state than Rupoop models, including `acl_access`, `advert`, `audiotracks`, `cuepoints`, `drm_token`, `is_paid`, `live_streams`, `player`, `remove_unseekable_blocks`, `stream_type`, `viewer`, `views_history`, and `yast`. A production adapter must not assume that “has an HLS URL” is the only relevant access decision.
- The sampled master playlist had 12 variant URI lines. One sampled VOD media playlist contained 1,352 media URI lines and standard VOD tags (`EXTINF`, `EXT-X-ENDLIST`, `EXT-X-INDEPENDENT-SEGMENTS`, `EXT-X-MEDIA-SEQUENCE`, `EXT-X-PLAYLIST-TYPE`, `EXT-X-TARGETDURATION`, and `EXT-X-VERSION`). It had no `EXT-X-DISCONTINUITY`, `EXT-X-DATERANGE`, explicit CUE/SCTE tag, or absolute segment host.

### Advertising evidence and limits

- Four anonymously sampled playable videos across music, news, film, and sport had an HLS source; each returned an empty `advert` array, an empty `cuepoints` array, and `yast = null` at observation time. The sampled manifests did not expose an ad marker in their master playlists; the one inspected media playlist also had no discontinuity, date-range, CUE, or SCTE marker.
- The narrow conclusion is that **these anonymous samples exposed a content-only HLS path while the player-options schema retained fields for advertising orchestration**. This is consistent with player/frontend-controlled advertising for the samples. It is not enough to exclude account-, region-, time-, content-, live-stream-, or experiment-dependent ads, redirects, or server-side insertion elsewhere.
- Rupoop contains no marker classifier or removal logic, so it cannot validate timestamp continuity, seek behavior, audio-track continuity, or quality switching after ad removal. Its behavior should be described as “direct HLS playback that bypasses the official player path,” not as a proven manifest-level blocker.
- Product/legal risk is material. RUTUBE's [custom integration rules](https://rutube.ru/info/platforma/) say integrations should not interfere beyond the public API and should not disable or cover player advertising. RUTUBE also markets ad-free viewing as a paid subscription benefit in its [subscription FAQ](https://rutube.ru/info/noads/). These first-party statements do not answer every legal question, but they rule out treating Rupoop's behavior as an officially supported ad-suppression contract.

## Conceptually reusable findings

1. **Keep an isolated catalog adapter.** The search and author-list endpoints are undocumented observations and can change independently of the UI.
2. **Keep a separate playback-source resolver.** Its input should be a normalized RUTUBE video ID; its output should be a typed source set plus entitlement/availability metadata, not a bare string.
3. **Use tolerant decoding but enforce local invariants.** Unknown response keys should survive in sanitized fixtures; missing `video_balancer.m3u8`, access stubs, and paid/DRM content must become explicit error variants.
4. **Let the platform player parse HLS.** Rupoop demonstrates that passing the master playlist to an adaptive player is enough for ordinary public VOD. webOS capability still needs proof on the LG C1.
5. **Separate local personalization from service identity.** A local history/recommendation/following layer can work anonymously, but its labels must not imply synchronization with the user's RUTUBE account.
6. **Cancel stale source requests and clear media state.** Rupoop cancels its prior video-loading job and resets media items before preparing a new source; the lifecycle idea is portable even though the Kotlin/ExoPlayer mechanism is not.

## Android-specific or unsuitable for direct reuse

- Kotlin data classes, Retrofit annotations, OkHttp interceptors, coroutines, Jetpack Compose state, Android intents/deep links, foreground services, Media3/ExoPlayer, and WorkManager.
- GitHub OAuth, the `rupoop://auth` callback, Cloudflare token-exchange proxy, private Gist schema, and stored GitHub access token. These solve Rupoop cross-device sync, not RUTUBE authentication.
- Android file paths and local JSON persistence.
- Touch gestures, orientation/Picture-in-Picture behavior, Android notification/media-session integration, and download services.
- The generic parsers and non-RUTUBE search engines for VK, OK, Lordfilm, and arbitrary web pages. They expand security, copyright, reliability, and maintenance scope without helping the LG C1 RUTUBE MVP.
- The current ID extractor and broad URL heuristics. They are permissive string operations and should not define the webOS protocol contract.
- Google/YouTube search suggestions. They are neither first-party RUTUBE behavior nor necessary for the MVP.

## Implications for this project

1. Use `search -> video ID -> play/options -> HLS` only for the playback spike, behind replaceable adapters and sanitized contract fixtures.
2. Do not claim DASH, DRM, paid content, live playback, account playback, comments, or official recommendations based on Rupoop. Each requires separate first-party evidence.
3. Do not implement Rupoop's GitHub login as RUTUBE login. If account features become necessary, investigate the official six-digit TV activation flow and keep credentials/tokens out of logs and fixtures.
4. Treat the advertising result as provisional: classify fresh options and manifests on representative VOD/live/account states before any suppression work. Fail open to valid playback when the classification is uncertain.
5. Record geographic/availability stubs in the source-resolver contract. A 200 search result is not evidence that playback options will be available.
6. Test the direct HLS flow on the real LG C1 before committing to a custom frontend; browser/desktop reachability does not prove webOS media compatibility, CORS behavior, codec support, lifecycle correctness, or long-run stability.

## Known gaps and blockers

- No RUTUBE account was used, so account-specific source selection, subscription entitlements, paid content, and personalized advertising were not observed.
- No live stream was inspected. Live sources may have different manifests, cue points, DRM, or ad insertion.
- The current checks used this agent's network path. Two documented/sample videos returned RUTUBE unavailability stubs, showing that region, VPN classification, rights, and publication timing affect reproducibility.
- No LG C1 request or playback was executed. All format observations remain desktop/network evidence.
- The official documentation reviewed describes player attributes and Smart TV product behavior, but not a supported public catalog/search/authentication API contract. Search, author listing, and direct media-field semantics must therefore be treated as undocumented and volatile.

## Reproduction notes

Safe reproduction needs only anonymous `GET` requests with a normal user agent:

1. request a search URL and choose a result whose `video_url` contains a public ID;
2. request `/api/play/options/{id}/?format=json`;
3. record only field names, booleans, status/stub identifiers, manifest type, and sanitized hosts;
4. never commit the returned HLS URL or its query string because it can be signed and short-lived;
5. fetch the HLS master and selected media playlist, recording tags and relative-vs-absolute URI structure rather than signed segment URLs.

Every future fixture should include observation date, content ID, anonymous/account state, region/network context, HTTP status, and source commit, while removing cookies, tokens, signed query strings, viewer identifiers, and personal data.
