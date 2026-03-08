const express = require('express');
const router  = express.Router();

/**
 * GET /api/safety
 * Returns structured data for the Aegis Safety Page (/safety on the frontend).
 * This endpoint is public — no auth required.
 */
router.get('/safety', (req, res) => {
    res.json({
        title: "Aegis Safety System",
        subtitle: "How Sigal Media Protects Its Community",
        lastUpdated: "2025-01-01",
        layers: [
            {
                id: 1,
                name: "Sentinel Scan",
                icon: "🛡️",
                trigger: "At the moment you press 'Share'",
                description: "A lightweight AI filter powered by Llama 3 (8B) scans your post before it goes live. It catches heavy profanity, direct threats, and obvious spam. This layer is intentionally minimal — we want creativity to flow freely.",
                blocks: ["Heavy profanity and personal insults", "Direct physical threats", "Spam and advertisements", "Hate speech and discrimination"],
                doesNotBlock: ["Disagreements and strong opinions", "Satire and humor", "Criticism of ideas (not people)"],
                affectsLimit: false,
                note: "If your post is blocked here, your daily post limit is NOT reduced. You can edit and repost.",
            },
            {
                id: 2,
                name: "Community Signal",
                icon: "🚨",
                trigger: "After a post goes live",
                description: "Every post that's visible to the community can be reported. If a post receives 5 or more unique reports, the system automatically moves it to the Aegis Quarantine (Review Pool) and triggers a deep analysis.",
                threshold: 5,
                details: [
                    "Each user can only report a specific post once (no spam reporting).",
                    "Reports are anonymous — the author will never know who reported their post.",
                    "Quarantined posts remain hidden from the main feed until reviewed.",
                ],
            },
            {
                id: 3,
                name: "Military Audit",
                icon: "⚔️",
                trigger: "When a post crosses the report threshold",
                description: "The most powerful layer. Llama 3.3 (70B) — the largest publicly available open-source model — performs a deep analysis. It is specifically trained to detect subtle bullying, passive-aggressive attacks, gaslighting, and content that disrupts community harmony in ways lighter filters miss.",
                verdicts: {
                    SAFE: {
                        label: "SAFE — Cleared",
                        outcome: "The post is returned to the feed and marked as reviewed. It cannot be mass-reported again.",
                        icon: "✅"
                    },
                    UNSAFE: {
                        label: "UNSAFE — Removed",
                        outcome: "The post is permanently removed. The decision and reason are logged in the audit trail.",
                        icon: "🚫"
                    },
                },
                humanOverride: "Moderators and Admins can always override an AI decision. Every decision is logged with a timestamp, the deciding party (AI or human), and the reason.",
            },
        ],
        anonymity: {
            title: "Your Anonymity is Sacred",
            body: "Sigal Media does not collect names, emails, or phone numbers. Your identity is represented only by a device fingerprint that never leaves our servers. Even in moderation decisions, your real identity is never exposed — not to moderators, not to other users, not to us.",
        },
        rbac: {
            title: "Who Makes the Decisions?",
            roles: [
                { name: "User", description: "Can post, report, and interact. No admin access." },
                { name: "Moderator", description: "Can review quarantine, approve or reject AI decisions, and delete harmful content." },
                { name: "Super Admin", description: "All moderator powers, plus: assigning roles, forcing Military Audits, and full audit log access." },
            ],
        },
        contact: {
            title: "Something Slipped Through?",
            body: "No system is perfect. If you believe a post has violated community standards and wasn't caught, or that a post was wrongly removed, reach out via the feedback form inside the app.",
        }
    });
});

module.exports = router;