# Caloryst Clean Architecture design brief

## Requested outcome

Design a Clean Architecture for an open-source calorie tracker using React,
TypeScript, Rust, Axum, and PostgreSQL. Bring the English README to the presentation
standard of the owner's UltraMusic and Discard repositories.

The owner explicitly selected a progressive web app (PWA) with individual user accounts.

## Deliverables and source of truth

- [README](../../../README.md): public overview, honest status, planned capabilities, stack, roadmap, navigation.
- [Architecture](../../ARCHITECTURE.md): canonical dependency, data, identity, and deployment design.
- [Engineering standards](../../ENGINEERING.md): Rust, Axum, React, TypeScript, persistence practices.
- [Agent instructions](../../../AGENTS.md): constraints for later implementation.

## Engineering recommendations

A modular monolith, three backend packages, feature-based frontend organization,
manual food entry, decimal quantities, historical diary snapshots, provider-backed
authentication, and server-side sessions. These are recommendations rather than
additional product requirements approved by the owner.

PWA delivery includes manifest/icons and a service worker lifecycle. The initial
offline recommendation covers the public shell only; private data access requires
a connection. Offline logging/synchronization remains a separate product decision.

## Scope and unresolved decisions

This change produces documentation, without scaffolding software or implementing
authentication. Provider, hosting, operational bounds, and retention remain open
in the canonical architecture. Review the design before planning implementation.
