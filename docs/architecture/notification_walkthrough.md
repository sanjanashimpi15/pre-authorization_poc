# Design Walkthrough & Justifications — Notification & Collaboration Service

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Notification & Collaboration Service (NCS)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why decouple notifications from the core services?
If Taiga, Aegis, and FCP all had their own email/SMS logic, we would duplicate Twilio integrations across the codebase. More importantly, we couldn't enforce global hospital preferences (e.g., "Don't SMS Dr. Smith on weekends"). A centralized NCS ensures uniform delivery, templating, and rate-limiting.

### Q2. How does NCS handle inbound replies (e.g., WhatsApp)?
NCS exposes a public webhook endpoint for Twilio/Meta. When a doctor replies "APPROVE" to a WhatsApp message, Twilio hits the webhook. NCS parses the sender's phone number, looks up their active `PENDING` tasks in the database, maps "APPROVE" to the required action, resolves the task, and sends a signal to MCO to resume the claim workflow.

### Q3. Why are task escalations critical?
In insurance, SLAs are everything. If a TPA issues a query, the hospital might only have 24 hours to respond before the claim is auto-denied. If the assigned doctor is on leave and ignores the notification, the hospital loses money. Escalation timers ensure the task is automatically reassigned to the HOD (Head of Department) before the SLA breaches.

### Q4. How does NCS manage Real-Time In-App notifications?
Using WebSockets (Socket.io). When the React frontend loads, it establishes a persistent TCP connection to NCS. If Aegis finishes drafting an appeal, NCS pushes the alert over the socket, and a toast notification instantly appears on the user's screen without them needing to refresh the page.

### Q5. How do `@mentions` work in comments?
When a user posts a comment via the UI, the NCS regex parser scans for `@username`. It looks up the user, creates a `comment_mentions` record, and dispatches a targeted notification to that specific user: "You were mentioned in Claim #123."

### Q6. Can NCS consolidate notifications (Batching)?
Yes, this is essential for email. Instead of sending a medical director 50 individual emails for 50 pending approvals, the Template Engine can hold non-urgent notifications and dispatch a "Daily Digest" email at 8 AM.

### Q7. How is PHI (Protected Health Information) handled on external channels?
**Tradeoff**: External channels (WhatsApp/SMS) are not inherently HIPAA/NDHM compliant for sharing medical data.
**Justification**: NCS templates enforce strict variable scrubbing. A template for SMS might be: `Alert: Action required on Claim {{claimId}}`. It deliberately omits `{{patient.name}}` or `{{diagnosis}}`. The user must click the secure link and authenticate into Aivana to see the clinical details.

### Q8. What happens if a doctor's phone is off and SMS fails?
The Twilio adapter listens for delivery receipts. If it receives a `FAILED` or `UNDELIVERED` status, it updates the internal delivery log. Depending on the hospital's configuration, NCS can trigger a fallback (e.g., auto-escalate immediately, or send an Email instead).

### Q9. How does NCS avoid spamming users?
Through "Smart Routing." If the WebSocket connection indicates the user is currently looking at the Aivana Dashboard, NCS routes the alert In-App and suppresses the SMS. This significantly reduces Twilio costs and prevents user notification fatigue.

### Q10. What is the difference between a Task and a Notification?
A Notification is informational ("Claim Settled"). A Task requires action ("Sign Document"). Tasks block the MCO workflow; notifications do not. Tasks have SLAs and escalations; notifications do not.

### Q11. How does NCS handle multi-tenancy?
Every template, user preference, and task is partitioned by `hospitalId`. A template named `appeal_ready` for Apollo can have completely different wording and branding than the `appeal_ready` template for Fortis.

### Q12. Can a hospital customize their notification templates?
Yes. The UI provides a WYSIWYG editor where hospital admins can modify templates using standard handlebar variables (`{{claimAmount}}`, `{{tpaName}}`).

### Q13. How does NCS scale WebSocket connections?
A single Node.js instance can handle ~10k concurrent WebSockets. For 100k users, NCS runs multiple Node.js pods behind a load balancer. It uses a Redis Pub/Sub backplane. If Pod A wants to notify User X, but User X is connected to Pod B, Pod A publishes to Redis, Pod B receives it, and pushes it down the correct socket.

### Q14. What if the MCO workflow is cancelled, but a task is still pending?
If a claim is aborted, MCO sends a `CANCEL_TASKS` event to NCS. NCS immediately marks all pending tasks for that claim as `CANCELLED`, removing them from the users' inboxes and stopping any pending escalation timers.

### Q15. How are escalation matrices defined?
In the Hospital Configuration Service. It might look like: `Level 1: Assignee (0 hrs) -> Level 2: Billing Manager (4 hrs) -> Level 3: CFO (24 hrs)`.

### Q16. Can tasks be reassigned manually?
Yes. If a doctor knows they are going into surgery, they can click "Reassign" in the UI and select a colleague. NCS transfers the task ownership and resets the escalation timer.

### Q17. How does NCS handle downtime of third-party APIs (e.g., Twilio outage)?
It relies on exponential backoff queues (like BullMQ or Celery). If Twilio returns 503 HTTP errors, the messages sit safely in the Redis queue until Twilio recovers.

### Q18. Does NCS support Voice Calls?
It can. Twilio Programmable Voice can be integrated as an adapter for `CRITICAL` priority escalations (e.g., an automated voice calling the HOD at 2 AM for a massive claim dispute).

### Q19. How do we ensure comments are permanently attached to the claim?
Comments are stored in Postgres. When the FCP (Final Claim Packet) is generated or archived, a PDF transcript of the comment thread can be optionally appended for internal hospital auditing (never sent to the TPA).

### Q20. Can users reply to Emails to post a comment?
Yes (Future Scope). NCS can integrate with a service like SendGrid Inbound Parse. A user replies to `claim-123@aivana.com`, and NCS parses the email body and inserts it as a comment in the UI.

### Q21. How do you handle timezones?
All task deadlines and escalation timers are calculated in UTC. When rendering in the UI, or formatting templates for SMS, the Template Engine converts the UTC timestamp into the hospital's local timezone (e.g., IST) using the config service.

### Q22. What happens if two users try to resolve the same task?
Optimistic concurrency control. The database uses a `version` integer on the task row. If User A resolves it, `version` goes from 1 to 2. If User B clicks resolve a second later, their request (expecting version 1) fails, and the UI says "Task already resolved by User A."

### Q23. Why use PostgreSQL for tasks instead of MongoDB?
Tasks and Comments are highly relational data (Task -> Assignee -> Claim -> Escalation). ACID compliance and strict relational integrity are vital to ensure a task isn't accidentally orphaned.

### Q24. Can NCS trigger push notifications to a mobile app?
Yes. By integrating a Firebase Cloud Messaging (FCM) adapter, NCS can send native iOS/Android push notifications to the Aivana mobile app.

### Q25. What is the primary business value of NCS?
It drastically reduces the "Time-to-Action." By bringing the alert directly to the doctor's WhatsApp, rather than waiting for them to log into a portal 3 days later, Aivana shrinks the overall claim lifecycle and prevents TPA SLA breaches.

---

*End of Document*
