# Project

This project contains a school application with three main components:

* Flutter mobile application
* Web administration frontend
* Backend API

The primary development target for this agent is the Flutter mobile application.

# Project Structure

## Mobile

Path:

D:/OpenAIoT/AI/school/apps/mobile

This is the primary implementation target.

Use this project for:

* Flutter UI
* Dart code
* Navigation
* State management
* Forms
* Validation
* Authentication
* API integration
* Mobile-specific behavior
* Mobile UX
* Android functionality
* Flutter testing and debugging

## Admin Web

Path:

D:/OpenAIoT/AI/school/apps/admin

This is the existing web frontend.

Use it primarily as a reference for:

* Existing features
* Existing workflows
* UI behavior
* Form fields
* Validation rules
* Permissions
* Business behavior
* API usage

Do not modify this project unless the user explicitly requests it or a backend/frontend change is genuinely required.

## API

Path:

D:/OpenAIoT/AI/school/apps/api

This is the backend API.

Use it as the source of truth for:

* API endpoints
* Request formats
* Response formats
* Authentication
* Authorization
* Validation
* Business rules
* Data structures

Do not modify the API merely to make Flutter implementation easier.

Only modify the backend when:

1. The user explicitly requests it, or
2. The required Flutter functionality cannot be implemented correctly without a backend change.

# Primary Rule

## Flutter First

The default implementation target is:

D:/OpenAIoT/AI/school/apps/mobile

When the user asks for a feature, implement it in Flutter unless explicitly instructed otherwise.

The web frontend and backend are supporting references.

# Investigation Order

When implementing a Flutter feature:

1. Inspect the relevant Flutter code.
2. Identify existing architecture and conventions.
3. Check the web frontend when behavior or workflow is unclear.
4. Check the backend when API behavior or business rules are unclear.
5. Implement the feature in Flutter.
6. Verify the affected Flutter functionality.

Do not explore unrelated parts of the project.

# Web Frontend as Reference

When the same feature exists in:

D:/OpenAIoT/AI/school/apps/admin

use it to understand expected behavior.

Do not blindly copy web UI into Flutter.

Translate the behavior into appropriate mobile UX.

For example:

* Web tables → mobile lists/cards
* Web dialogs → mobile dialogs/bottom sheets where appropriate
* Desktop navigation → mobile navigation
* Wide forms → mobile-friendly forms
* Mouse interactions → touch interactions

The goal is behavioral consistency, not visual duplication.

# Backend as Source of Truth

Before creating or changing API integration:

* Inspect existing API endpoints.
* Inspect request parameters/body.
* Inspect response structures.
* Inspect authentication requirements.
* Inspect validation and business rules.
* Inspect how the web frontend currently consumes the API.

Do not guess an API contract when source code is available.

Prefer using existing endpoints.

Do not create duplicate API logic in Flutter.

# Flutter Architecture

Follow the architecture already present in:

D:/OpenAIoT/AI/school/apps/mobile

Before introducing a new:

* State management solution
* Networking library
* Routing solution
* Dependency
* Architecture pattern
* UI component system

inspect the existing implementation first.

Prefer consistency with the current application over introducing a new pattern.

# UI Rules

Every feature should properly handle applicable states:

* Initial
* Loading
* Success
* Empty
* Error
* Retry

Forms should handle:

* Required fields
* Validation
* API validation errors
* Loading/submission state
* Keyboard behavior
* Appropriate input types

Use mobile-friendly touch targets and layouts.

# Code Quality

Prefer:

* Small focused widgets
* Reusable components
* Clear naming
* Null safety
* Strong typing
* Existing project patterns
* Minimal duplication
* Explicit error handling

Avoid:

* Huge widgets
* Unnecessary abstractions
* Unnecessary dependencies
* Duplicate API implementations
* Hardcoded business rules when they belong to the backend
* Fake data unless explicitly requested
* Unrelated refactoring

# Change Scope

Keep every change focused on the requested feature.

Do not modify unrelated files.

Do not refactor existing code simply because it could be written differently.

Preserve existing behavior unless the requested feature explicitly changes it.

# Permissions

Respect the existing permission and authorization system.

Do not bypass permissions in the mobile application.

If permissions are enforced by the backend, treat backend authorization as authoritative.

The Flutter UI may hide or disable functionality based on permissions, but must not assume UI restrictions are sufficient for security.

# Data and Business Logic

Business rules should remain consistent with the backend.

If the web application and Flutter application appear to implement different rules:

1. Inspect the backend.
2. Determine which behavior is authoritative.
3. Do not silently invent a third behavior.
4. Report the conflict if it affects the requested implementation.

# Verification

After implementation, verify as much as practical:

* `flutter analyze`
* Relevant Flutter tests
* Compilation/build errors
* Navigation
* API integration
* Loading states
* Empty states
* Error handling
* Existing affected functionality

Do not claim a test or build was successful unless it was actually run.

# Completion Report

When a task is complete, report:

## Changed

Brief list of implemented changes.

## Verified

Brief list of checks actually performed.

## Remaining

Only mention remaining work, limitations, or unverified items.

Do not describe every implementation step.

# Important Boundary

This agent is primarily a Flutter/mobile developer.

If a task can be solved entirely inside:

D:/OpenAIoT/AI/school/apps/mobile

do not modify:

D:/OpenAIoT/AI/school/apps/admin

or:

D:/OpenAIoT/AI/school/apps/api

If a backend change is required, explain why before making a broad backend modification.
