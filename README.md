# DEPRECATED
pwsh.gallery is now run via Sleet and a custom update script to an Azure Storage Account fronted by Cloudflare. This repository is still a functional implementation of a nuget v2->v3 proxy in Cloudflare Workers.


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

## PowerShell Gallery Optimization

Based on testing, fetching a single package info vs fetching all package infos is negligible, so we go ahead and fetch
the first 100 results regardless even if we only present less to the user.

PWSHGallery presents only the latest versions on the first query page, to minimize bandwidth, and in PowerShell the vast majority of queries are for this as version pinning is less common in PS since multiple versions of a module can be loaded. The remaining 98-ish results are cached to a "recent" page, and the remainder packages are fetched in the background and loaded to an "other" page. Since the majority of queries are for latest or recent, older can be a larger unoptimized fetch.

## Standard v3 Nuget Client Flow (todo)

Queries are styled after NuGet v3, where full client info is provided. Some clients do not follow the nuget v3 server spec
such as PowerShellGet and require information that is marked optional in that spec.

Items retrieved from the query will be broken into pages at 10 module version boundaries by creation date to ensure a stable interface.
"latest" modules will be inlined to the index request, all other pages will be referenced. Index will have a cache lifetime of 60 seconds
But Pages can be considered "static stable" and will be set to max cache lifetime.
