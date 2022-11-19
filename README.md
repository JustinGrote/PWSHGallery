# PowerShell Gallery Cloudflare Worker "mirror"

This repo is an example of using CloudFlare workers to intelligently query and process a nuget v2 repository and present
it as nuget v3. v3 has lots of advantages including JSON format and much easier cacheability of queries.

## Flow

Most v3 clients request the index.json of services followed by requesting "registration" info, which is basically
package metadata.

For the ModuleFast PowerShell client, we don't care about anything but the packages and their dependencies, so based
on that user-agent, we only supply the bare minimum info.

TODO: Publish a service that returns the dependency graph of a module in a single API call. Will probably need worker bindings
to build it and not exceed the 50ms CPU limit or subrequest limit. Generally probably not worth the effort as multiplexing
package queries is pretty effective

## ModuleFast flow

For origin queries, a "cold" hit will fetch all versions and dependencies of a package. Nuget v3 allows you to present
"pages" of data, so we inline the "latest" version which is what 90% of queries will look for as a top page, and then
present a "stub" page for all other versions. This enables the client to determine what packages meet the dependency criteria
without having to perform queries for each version.

We instruct the client to keep this in their local cache for 24 hours, but a client can request a "fresh" copy at any
time with the no-cache header, this is useful in case someone is testing/publishing new modules frequently.

## Standard v3 Nuget Client Flow (todo)

Queries are styled after NuGet v3, where full client info is provided. Some clients do not follow the nuget v3 server spec
such as PowerShellGet and require information that is marked optional in that spec.

Items retrieved from the query will be broken into pages at 10 module version boundaries by creation date to ensure a stable interface.
"latest" modules will be inlined to the index request, all other pages will be referenced. Index will have a cache lifetime of 60 seconds
But Pages can be considered "static stable" and will be set to max cache lifetime.
