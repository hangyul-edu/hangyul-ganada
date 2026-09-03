# Synthetic 118-user journey QA

**This is a simulation.** 118 synthetic learners were driven through
the real product domain code — the same plan builder, question builder,
crediting rules, memory scheduler and streak arithmetic the shipping app
runs — by `scripts/synthetic-users-qa.mjs` from the fixtures in
`qa/synthetic-users.json`. Every number below is a **synthetic educational
outcome**: it is evidence about the software, and it is not evidence about
human learning. No human used the product to produce this file.

Rendering is out of scope here and covered elsewhere: `screens:audit` (143
renders at seven device profiles), `qa:locales` (256 locale renders) and the
Playwright suite drive the pixels. The `device`/`platform` columns below
record the persona definition; they do not alter a domain simulation.

- personas: 118
- journeys PASS: 118 · FAIL: 0
- locales covered: 32 of 32
- levels covered: 30 of 30
- total simulated study days: 1,223
- questions answered: 30,888
- wrong-answer retries asked: 5,184
- mid-session reloads exercised: 771
- mid-day level retakes exercised: 18

## Synthetic educational outcome

| Proxy | Value |
| --- | --- |
| Unique words introduced | 8,046 |
| Unique words mastered (answered correctly) | 8,045 |
| Words missed at least once | 3,081 |
| Retry recovery | 100% |
| Later-review retention | 72% |
| Words met on two or more days | 3,615 |
| Words marked learned without a correct answer | 0 |
| Teaching-zone violations | 0 |
| Beginner words offered to level ≥ 25 learners | 0 |
| Mixed-language questions built | 0 |
| Sittings stuck with no next action | 0 |

## The hundred journeys

| ID | Locale | Lv | Test | History | Goal | Days | Acc | Device | Introduced | Mastered | Wrong | Recovered | Saved | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P001 | nl | 27 | taken | returning | 10 | 7 | 0.66 | native/360 | 41 | 41 | 21 | 21 | 0 | PASS |
| P002 | id | 3 | taken | new | 15 | 3 | 0.73 | web/320 | 33 | 33 | 10 | 10 | 0 | PASS |
| P003 | el | 9 | skipped | returning | 15 | 7 | 0.57 | native/360 | 66 | 66 | 31 | 31 | 0 | PASS |
| P004 | nl | 5 | taken | new | 10 | 7 | 0.75 | web/430 | 37 | 37 | 14 | 14 | 0 | PASS |
| P005 | cs | 30 | taken | new | 20 | 7 | 0.85 | web/390 | 75 | 75 | 19 | 19 | 0 | PASS |
| P006 | uz | 10 | taken | returning | 5 | 30 | 0.71 | native/430 | 92 | 92 | 28 | 28 | 26 | PASS |
| P007 | id | 30 | taken | new | 10 | 14 | 0.75 | native/360 | 80 | 80 | 30 | 30 | 0 | PASS |
| P008 | zh-CN | 4 | taken | returning | 10 | 3 | 0.72 | web/desktop | 22 | 22 | 9 | 9 | 0 | PASS |
| P009 | zh-CN | 10 | taken | returning | 15 | 7 | 0.9 | web/320 | 68 | 68 | 10 | 10 | 7 | PASS |
| P010 | ro | 12 | taken | new | 10 | 7 | 0.91 | web/412 | 40 | 40 | 7 | 7 | 0 | PASS |
| P011 | hi | 15 | taken | new | 10 | 30 | 0.91 | native/430 | 252 | 252 | 61 | 61 | 0 | PASS |
| P012 | en | 28 | taken | new | 10 | 1 | 0.69 | native/430 | 15 | 15 | 6 | 6 | 1 | PASS |
| P013 | hu | 30 | taken | returning | 10 | 14 | 0.73 | web/320 | 76 | 76 | 37 | 37 | 0 | PASS |
| P014 | de | 2 | taken | new | 15 | 7 | 0.95 | web/412 | 77 | 77 | 8 | 8 | 7 | PASS |
| P015 | pt-BR | 10 | taken | new | 10 | 3 | 0.61 | web/430 | 20 | 20 | 11 | 11 | 0 | PASS |
| P016 | mn | 5 | taken | new | 5 | 30 | 0.94 | native/430 | 93 | 93 | 12 | 12 | 28 | PASS |
| P017 | hu | 1→1 | retaken | returning | 10 | 30 | 0.9 | web/desktop | 117 | 117 | 34 | 34 | 28 | PASS |
| P018 | uk | 3 | taken | new | 5 | 7 | 0.64 | web/desktop | 35 | 35 | 21 | 21 | 0 | PASS |
| P019 | es | 3 | skipped | new | 5 | 14 | 0.88 | web/320 | 75 | 75 | 20 | 20 | 13 | PASS |
| P020 | fil | 20→18 | retaken | new | 10 | 30 | 0.88 | web/desktop | 159 | 159 | 47 | 47 | 30 | PASS |
| P021 | sv | 6 | taken | new | 10 | 14 | 0.68 | web/320 | 75 | 75 | 39 | 39 | 0 | PASS |
| P022 | fr | 26→24 | retaken | new | 15 | 30 | 0.64 | native/320 | 254 | 254 | 136 | 136 | 28 | PASS |
| P023 | en | 25 | taken | returning | 10 | 30 | 0.91 | web/360 | 243 | 243 | 44 | 44 | 28 | PASS |
| P024 | pl | 2 | skipped | returning | 10 | 3 | 0.84 | web/412 | 23 | 23 | 2 | 2 | 3 | PASS |
| P025 | zh-CN | 1 | taken | returning | 20 | 14 | 0.87 | web/430 | 111 | 111 | 43 | 43 | 0 | PASS |
| P026 | kk | 10 | taken | returning | 10 | 1 | 0.77 | web/320 | 15 | 15 | 2 | 2 | 1 | PASS |
| P027 | bn | 30 | taken | new | 10 | 3 | 0.58 | web/430 | 21 | 21 | 8 | 8 | 3 | PASS |
| P028 | es | 20 | taken | new | 15 | 30 | 0.72 | web/desktop | 241 | 241 | 95 | 95 | 0 | PASS |
| P029 | ko | 30 | taken | returning | 10 | 30 | 0.72 | web/360 | 247 | 247 | 96 | 96 | 0 | PASS |
| P030 | th | 25 | taken | returning | 20 | 30 | 0.58 | native/390 | 257 | 257 | 134 | 134 | 0 | PASS |
| P031 | en | 22 | taken | new | 10 | 1 | 0.78 | web/360 | 15 | 15 | 1 | 1 | 0 | PASS |
| P032 | ar | 30 | taken | new | 20 | 1 | 0.84 | native/390 | 20 | 20 | 3 | 3 | 1 | PASS |
| P033 | tr | 30 | taken | new | 5 | 1 | 0.87 | native/412 | 5 | 5 | 0 | 0 | 1 | PASS |
| P034 | it | 5 | taken | returning | 5 | 1 | 0.76 | native/430 | 5 | 5 | 1 | 1 | 1 | PASS |
| P035 | en | 3 | skipped | new | 10 | 7 | 0.61 | web/430 | 42 | 42 | 24 | 24 | 7 | PASS |
| P036 | ar | 10 | taken | returning | 5 | 1 | 0.68 | native/390 | 5 | 5 | 2 | 2 | 1 | PASS |
| P037 | ja | 21 | taken | new | 15 | 7 | 0.77 | native/320 | 67 | 67 | 25 | 25 | 0 | PASS |
| P038 | en | 20 | taken | new | 20 | 1 | 0.9 | web/430 | 20 | 20 | 3 | 3 | 0 | PASS |
| P039 | ru | 30 | taken | new | 15 | 1 | 0.82 | native/412 | 15 | 15 | 3 | 3 | 0 | PASS |
| P040 | ta | 13 | taken | new | 5 | 7 | 0.87 | native/390 | 23 | 23 | 6 | 6 | 0 | PASS |
| P041 | th | 10 | taken | new | 15 | 14 | 0.63 | web/desktop | 111 | 111 | 53 | 53 | 12 | PASS |
| P042 | zh-CN | 18 | taken | returning | 10 | 3 | 0.79 | web/desktop | 23 | 23 | 5 | 5 | 3 | PASS |
| P043 | fr | 29 | taken | new | 10 | 30 | 0.63 | native/390 | 155 | 155 | 75 | 75 | 25 | PASS |
| P044 | es | 1→1 | retaken | returning | 15 | 7 | 0.6 | native/430 | 73 | 73 | 34 | 34 | 6 | PASS |
| P045 | vi | 10 | taken | returning | 5 | 30 | 0.72 | native/desktop | 89 | 89 | 31 | 31 | 27 | PASS |
| P046 | te | 23 | taken | returning | 20 | 30 | 0.58 | native/320 | 252 | 252 | 134 | 134 | 0 | PASS |
| P047 | te | 3 | taken | new | 5 | 1 | 0.56 | native/320 | 5 | 5 | 2 | 2 | 0 | PASS |
| P048 | ta | 1 | taken | returning | 10 | 1 | 0.9 | native/430 | 10 | 10 | 1 | 1 | 0 | PASS |
| P049 | de | 5 | taken | new | 20 | 1 | 0.89 | web/430 | 20 | 20 | 1 | 1 | 1 | PASS |
| P050 | th | 30 | taken | new | 10 | 14 | 0.81 | web/320 | 75 | 75 | 27 | 27 | 0 | PASS |
| P051 | es | 25 | taken | returning | 20 | 7 | 0.89 | web/430 | 77 | 77 | 19 | 19 | 7 | PASS |
| P052 | mn | 15 | taken | new | 15 | 1 | 0.63 | web/390 | 15 | 15 | 3 | 3 | 1 | PASS |
| P053 | zh-CN | 11 | taken | new | 10 | 30 | 0.57 | web/320 | 155 | 155 | 83 | 83 | 0 | PASS |
| P054 | ky | 1 | taken | new | 10 | 7 | 0.79 | web/430 | 42 | 42 | 16 | 16 | 7 | PASS |
| P055 | ja | 16 | taken | new | 10 | 1 | 0.64 | native/412 | 15 | 15 | 8 | 8 | 1 | PASS |
| P056 | ko | 20 | taken | returning | 10 | 3 | 0.85 | native/desktop | 15 | 15 | 1 | 1 | 2 | PASS |
| P057 | pt-BR | 15 | taken | new | 10 | 7 | 0.91 | web/390 | 67 | 67 | 10 | 10 | 0 | PASS |
| P058 | pt-BR | 1 | skipped | new | 10 | 14 | 0.84 | web/desktop | 78 | 78 | 26 | 26 | 0 | PASS |
| P059 | ja | 19→15 | retaken | new | 10 | 14 | 0.6 | web/320 | 112 | 112 | 58 | 58 | 12 | PASS |
| P060 | hi | 25 | taken | new | 20 | 1 | 0.58 | native/320 | 20 | 20 | 9 | 9 | 1 | PASS |
| P061 | vi | 15 | taken | returning | 15 | 7 | 0.92 | native/360 | 60 | 60 | 12 | 12 | 6 | PASS |
| P062 | th | 25 | taken | returning | 10 | 7 | 0.91 | web/desktop | 44 | 44 | 5 | 5 | 0 | PASS |
| P063 | en | 17→22 | retaken | returning | 5 | 7 | 0.79 | native/390 | 40 | 40 | 13 | 13 | 7 | PASS |
| P064 | ro | 3 | taken | returning | 10 | 7 | 0.69 | web/430 | 41 | 41 | 21 | 21 | 5 | PASS |
| P065 | cs | 29 | taken | new | 20 | 3 | 0.77 | native/desktop | 28 | 28 | 10 | 10 | 2 | PASS |
| P066 | ta | 3 | taken | new | 5 | 3 | 0.56 | native/390 | 11 | 11 | 5 | 5 | 0 | PASS |
| P067 | tr | 15 | taken | new | 5 | 30 | 0.63 | web/390 | 92 | 92 | 39 | 39 | 0 | PASS |
| P068 | th | 8 | taken | returning | 10 | 3 | 0.66 | native/desktop | 21 | 21 | 6 | 6 | 2 | PASS |
| P069 | vi | 20 | taken | new | 10 | 7 | 0.71 | native/360 | 63 | 63 | 23 | 23 | 7 | PASS |
| P070 | ky | 7 | taken | new | 10 | 7 | 0.78 | native/320 | 41 | 41 | 12 | 12 | 6 | PASS |
| P071 | uk | 30→30 | retaken | returning | 5 | 14 | 0.77 | web/desktop | 75 | 75 | 27 | 27 | 0 | PASS |
| P072 | kk | 30 | taken | new | 10 | 1 | 0.57 | web/360 | 15 | 15 | 5 | 5 | 1 | PASS |
| P073 | tr | 30 | taken | returning | 5 | 7 | 0.62 | web/320 | 23 | 23 | 11 | 11 | 7 | PASS |
| P074 | en | 3 | taken | new | 20 | 30 | 0.95 | web/430 | 226 | 226 | 49 | 49 | 0 | PASS |
| P075 | bn | 15 | taken | new | 10 | 30 | 0.75 | native/360 | 157 | 157 | 69 | 69 | 0 | PASS |
| P076 | pl | 25 | taken | returning | 10 | 7 | 0.59 | web/desktop | 41 | 41 | 16 | 16 | 5 | PASS |
| P077 | el | 1 | taken | new | 10 | 14 | 0.74 | native/desktop | 72 | 72 | 22 | 22 | 12 | PASS |
| P078 | pt-BR | 3 | taken | returning | 5 | 7 | 0.56 | web/430 | 40 | 40 | 22 | 22 | 0 | PASS |
| P079 | hi | 15 | taken | new | 10 | 1 | 0.87 | native/390 | 10 | 10 | 1 | 1 | 0 | PASS |
| P080 | fr | 28 | taken | returning | 5 | 3 | 0.67 | native/360 | 15 | 15 | 9 | 9 | 0 | PASS |
| P081 | uz | 1 | taken | returning | 20 | 14 | 0.62 | web/430 | 107 | 107 | 69 | 69 | 0 | PASS |
| P082 | th | 15 | taken | returning | 10 | 7 | 0.71 | native/desktop | 59 | 59 | 22 | 22 | 0 | PASS |
| P083 | ja | 14 | taken | returning | 20 | 30 | 0.73 | native/390 | 266 | 266 | 147 | 147 | 0 | PASS |
| P084 | fr | 5 | skipped | returning | 10 | 3 | 0.6 | web/430 | 15 | 15 | 10 | 10 | 0 | PASS |
| P085 | ru | 3 | skipped | returning | 5 | 7 | 0.73 | web/390 | 23 | 23 | 8 | 8 | 7 | PASS |
| P086 | ko | 3 | taken | new | 15 | 14 | 0.65 | web/412 | 121 | 121 | 54 | 54 | 0 | PASS |
| P087 | zh-CN | 1 | taken | new | 20 | 14 | 0.71 | web/390 | 111 | 111 | 61 | 61 | 0 | PASS |
| P088 | de | 5 | skipped | returning | 10 | 30 | 0.73 | native/320 | 123 | 123 | 55 | 55 | 0 | PASS |
| P089 | de | 3 | taken | returning | 10 | 30 | 0.78 | native/desktop | 153 | 153 | 65 | 65 | 0 | PASS |
| P090 | vi | 2 | skipped | returning | 10 | 14 | 0.7 | web/430 | 76 | 76 | 35 | 35 | 14 | PASS |
| P091 | ru | 5 | taken | returning | 5 | 3 | 0.81 | web/320 | 11 | 11 | 3 | 3 | 3 | PASS |
| P092 | sv | 5 | taken | new | 20 | 3 | 0.7 | web/desktop | 33 | 33 | 19 | 19 | 0 | PASS |
| P093 | zh-CN | 24 | taken | returning | 10 | 30 | 0.65 | native/desktop | 156 | 156 | 77 | 77 | 0 | PASS |
| P094 | vi | 20 | taken | new | 15 | 3 | 0.58 | web/360 | 31 | 31 | 18 | 18 | 3 | PASS |
| P095 | it | 5 | taken | new | 10 | 14 | 0.63 | web/412 | 76 | 76 | 41 | 41 | 13 | PASS |
| P096 | ja | 10 | taken | returning | 10 | 1 | 0.91 | native/412 | 15 | 15 | 1 | 1 | 1 | PASS |
| P097 | ar | 3 | taken | returning | 10 | 1 | 0.93 | native/430 | 10 | 10 | 0 | 0 | 0 | PASS |
| P098 | ko | 30→28 | retaken | new | 10 | 30 | 0.81 | web/desktop | 158 | 158 | 62 | 62 | 30 | PASS |
| P099 | fil | 30→28 | retaken | returning | 20 | 14 | 0.75 | web/320 | 130 | 130 | 50 | 50 | 13 | PASS |
| P100 | es | 5 | skipped | returning | 10 | 30 | 0.57 | native/430 | 114 | 114 | 73 | 73 | 0 | PASS |
| P101 | en | 1→30 | retaken-midday | new | 10 | 3 | 0.9 | native/390 | 25 | 25 | 4 | 4 | 0 | PASS |
| P102 | ko | 30→1 | retaken-midday | returning | 10 | 3 | 0.85 | web/360 | 25 | 25 | 4 | 4 | 0 | PASS |
| P103 | ja | 1→30 | retaken-midday | new | 10 | 5 | 0.9 | native/412 | 49 | 49 | 10 | 10 | 0 | PASS |
| P104 | hi | 1→30 | retaken-midday | new | 10 | 3 | 0.8 | native/360 | 29 | 28 | 5 | 4 | 0 | PASS |
| P105 | es | 5→20 | retaken-midday | returning | 10 | 5 | 0.75 | web/390 | 32 | 32 | 12 | 12 | 0 | PASS |
| P106 | fr | 20→10 | retaken-midday | returning | 10 | 5 | 0.8 | native/430 | 31 | 31 | 9 | 9 | 0 | PASS |
| P107 | de | 10→25 | retaken-midday | returning | 15 | 5 | 0.7 | native/390 | 49 | 49 | 20 | 20 | 0 | PASS |
| P108 | pt-BR | 25→3 | retaken-midday | returning | 10 | 3 | 0.85 | web/320 | 28 | 28 | 3 | 3 | 0 | PASS |
| P109 | zh-CN | 2→28 | retaken-midday | new | 5 | 3 | 0.9 | native/390 | 14 | 14 | 2 | 2 | 0 | PASS |
| P110 | vi | 28→2 | retaken-midday | returning | 10 | 3 | 0.8 | native/412 | 33 | 33 | 11 | 11 | 0 | PASS |
| P111 | ru | 15→30 | retaken-midday | returning | 10 | 5 | 0.75 | web/390 | 33 | 33 | 11 | 11 | 0 | PASS |
| P112 | ar | 30→15 | retaken-midday | returning | 10 | 3 | 0.8 | native/360 | 24 | 24 | 6 | 6 | 0 | PASS |
| P113 | en | 1→30 | retaken-midday | new | 10 | 3 | 0.85 | web/390 | 27 | 27 | 3 | 3 | 0 | PASS |
| P114 | ja | 2→28 | retaken-midday | new | 10 | 3 | 0.7 | web/390 | 23 | 23 | 8 | 8 | 0 | PASS |
| P115 | ko | 30→1 | retaken-midday | returning | 10 | 3 | 0.8 | web/390 | 27 | 27 | 5 | 5 | 0 | PASS |
| P116 | es | 5→20 | retaken-during-extra | new | 10 | 3 | 0.9 | web/390 | 37 | 37 | 3 | 3 | 0 | PASS |
| P117 | hi | 1→30 | retaken-during-extra | new | 10 | 3 | 0.8 | web/390 | 36 | 36 | 11 | 11 | 0 | PASS |
| P118 | de | 10→30 | retaken-midday | returning | 10 | 5 | 0.75 | web/390 | 35 | 35 | 8 | 8 | 0 | PASS |

## Defects found

None on this run. The classes this harness watches for were found and fixed
during its construction — see the report’s Synthetic 100-User section.
