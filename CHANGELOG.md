# Changelog

## 1.1.0

- The same paid click id from a second IP is blocked. A refresh from the same IP is not replay.
- `ysclid`, `wbraid`, `gbraid`, `ttclid`, and `rb_clickid` count as paid clicks.
- The log API scores the visitor's headers. The log request itself is not treated as the visit.
- A block cookie keeps the next page blocked, and the edge counts repeated landing hits.
- Hosting prefixes replace whole cloud /8 ranges, so office NAT is not marked as a datacenter.
- AdsBot-Google and Yandex ad checkers are allowed. A script client cannot hide behind those names.
- The middleware log and the client beacon within 3 seconds count as one visit.

## 1.0.0

- Initial release.
