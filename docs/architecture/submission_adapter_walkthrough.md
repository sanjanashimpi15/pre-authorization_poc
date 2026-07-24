# Design Walkthrough & Justifications — Submission Adapter Service (SAS)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Submission Adapter Service (SAS)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why is SAS a separate service from the Final Claim Packet (FCP)?
If FCP contained API logic for 50 different insurers, every time an insurer updated their portal, we would have to deploy the core packaging engine. SAS completely isolates the volatile external world from the highly stable internal platform.

### Q2. What is an RPA Adapter?
Robotic Process Automation. Many Indian TPAs do not have B2B APIs; hospitals are forced to upload claims via web browsers. SAS runs a headless browser (Playwright) that logs into the portal, clicks "New Claim", fills out the web form, and uploads the FCP PDF automatically.

### Q3. How fragile are RPA Adapters?
Extremely. If the TPA moves a button or changes a CSS class, the script breaks. This is why SAS isolates adapters into containerized plugins. We can push a hotfix for the "MDIndia RPA Adapter" in 5 minutes without touching any other part of Aivana.

### Q4. How does SAS handle TPA credentials?
Hospitals store their TPA login credentials (usernames, passwords, 2FA configurations) in Aivana's Vault. SAS fetches these credentials at runtime to impersonate the hospital during the upload.

### Q5. What happens if a TPA portal has a CAPTCHA?
SAS routes the CAPTCHA image to a third-party solver service (e.g., 2Captcha) or flags the claim in the UI, prompting the hospital billing staff to solve the CAPTCHA manually to unblock the RPA script.

### Q6. Why does SAS poll for status updates instead of relying on Webhooks?
While modern TPAs support Webhooks (`POST /aivana-webhook/status`), 80% of legacy TPAs do not. SAS must actively log back into the portal every few hours to scrape the status dashboard (e.g., "Pending" -> "Approved").

### Q7. How does SAS handle TPA File Size Limits?
It doesn't. If a TPA limits uploads to 25MB, the SAS configuration defines that rule. The **FCP Bundle Optimizer** (upstream) is responsible for compressing the PDF to fit that constraint *before* it reaches SAS. SAS expects perfectly formatted payloads.

### Q8. How does SAS interact with the Denial Analysis Service (DAS)?
If the SAS polling worker detects that a claim status changed to "Denied", it automatically downloads the Denial PDF from the portal and emits the `DENIAL_RECEIVED` event on Kafka. DAS listens to this event and begins its analysis.

### Q9. Can hospitals use Aivana if they refuse to give us their TPA passwords?
Yes. Aivana can operate in "Local Mode". The FCP generates the optimized ZIP bundle, and the hospital staff manually uploads it. SAS simply marks the internal status as `MANUALLY_SUBMITTED`.

### Q10. What is the plugin registry?
It is a dynamic loader pattern. Aivana developers write small scripts (plugins) implementing a standard interface: `submitClaim()`, `pollStatus()`, `submitAppeal()`. SAS loads these at boot based on a configuration file.

### Q11. How does SAS handle VPNs or IP Whitelisting?
Many hospital TPAs require traffic to originate from specific IP addresses. SAS routes outbound adapter traffic through NAT Gateways with static Elastic IPs, allowing TPAs to easily whitelist Aivana's infrastructure.

### Q12. What happens if a TPA portal goes offline for maintenance?
The SAS adapter throws a `TPA_UNAVAILABLE` exception. The SAS routing controller catches this and places the claim in an exponential backoff queue, retrying automatically when the portal returns online.

### Q13. How does SAS handle multi-part uploads?
Some portals require the `Discharge Summary` and `Lab Reports` to be uploaded in separate fields, rather than one merged PDF. The SAS adapter reads the `manifest.json` inside the FCP ZIP, extracts the individual files, and uploads them to the respective fields.

### Q14. What are the tradeoffs of using Playwright over Selenium for RPA?
**Tradeoff**: Playwright uses a unified browser context model, which is faster and handles Single Page Applications (SPAs) better than Selenium, but it can be heavier on memory.
**Justification**: Speed and reliability on React/Angular TPA portals outweigh memory costs.

### Q15. Does SAS translate internal Aivana medical codes to TPA codes?
No. The translation of clinical codes (ICD-10) is handled by Taiga. SAS only translates *transport-level* codes (e.g., Aivana's internal enum `CLAIM_TYPE_CASHLESS` -> TPA's API string `"CASH"`).

### Q16. How does SAS prove it submitted the claim?
SAS records the exact HTTP Response from the API, or takes a screenshot of the "Success" screen in the headless browser. This is stored in the `TransmissionReceipt` and acts as an irrefutable audit trail if the TPA claims they never received it.

### Q17. How does SAS support Appeals?
The Aegis service drops an `AppealPackage` into the queue. SAS uses the same TPA plugin, but calls the `submitAppeal()` interface method, navigating to the "Appeals" section of the portal instead of the "New Claims" section.

### Q18. What if the TPA portal requires an OTP sent to the doctor's phone?
This is a complex edge case. SAS integrates with an internal notification microservice. When the portal asks for an OTP, Aivana pings the doctor's WhatsApp/App. The doctor types the OTP into Aivana, and SAS injects it into the headless browser.

### Q19. How does SAS handle rate limiting?
SAS implements a distributed token bucket across its worker nodes. If a TPA only allows 10 API calls per minute, SAS queues outbound requests globally to ensure the hospital's IP doesn't get temporarily banned.

### Q20. Can SAS handle email submissions?
Yes. If a specific corporate insurer requires claims to be sent via email, an `EmailAdapter` plugin constructs a professional email, attaches the FCP, and sends it via SMTP.

### Q21. Why use Kafka instead of direct HTTP calls from FCP to SAS?
Decoupling. FCP finishes its job and emits an event. It doesn't care if the TPA portal takes 45 seconds to load. Kafka ensures the payload is safely persisted and allows SAS to process it asynchronously.

### Q22. How do we test SAS plugins?
By writing robust unit tests against mock servers, and by running nightly "canary" scripts against dummy accounts on the production TPA portals to detect silent UI changes.

### Q23. What happens if a hospital wants a direct API integration into their HIS?
SAS is purely for outbound TPA communication. HIS (Hospital Information System) integration happens on the ingestion side (Docling Gateway).

### Q24. How does SAS handle PDF passwords?
Some hospital systems generate password-protected PDFs. The FCP Normalizer removes passwords during packaging. SAS never deals with encrypted PDFs.

### Q25. What is the biggest risk to SAS?
The "Arms Race". Insurers often actively try to block RPA bots using Cloudflare or advanced bot detection. SAS mitigates this by using stealth browser profiles, residential proxies, and human-like typing cadences in Playwright.

---

*End of Document*
