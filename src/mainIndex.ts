/*** Returns the top level index for the nuget v3 API. */

export function mainIndexHandler(request: Request) {
	const requestHost = new URL(request.url).origin
	return new Response(getIndex(requestHost), {
		headers: {
			'content-type': 'application/json;charset=UTF-8',
		},
	})
}

function getIndex(host: string) {
	const baseUri = host
	const index = {
		version: '3.0.0',
		resources: [
			// {
			//   '@id': baseUri + '/query',
			//   '@type': 'SearchQueryService',
			//   comment: 'Query endpoint of NuGet Search service (primary)',
			// },
			// Lets see if it works without this.
			// {
			//   '@id': registrationUri,
			//   '@type': 'RegistrationsBaseUrl',
			//   comment:
			//     'Base URL of Azure storage where NuGet package registration info is stored. THIS WILL BREAK FOR NON-340+ CLIENTS',
			// },
			// {
			//   '@id': registrationUri,
			//   '@type': 'RegistrationsBaseUrl/3.4.0',
			//   comment:
			//     'NuGet package registration info that is stored in GZIP format and includes SemVer 2.0.0 packages',
			// },
			{
				'@id': baseUri,
				'@type': 'RegistrationsBaseUrl/3.6.0',
				comment:
					'NuGet package registration info that is stored in GZIP format and includes SemVer 2.0.0 packages',
			},

			// Should not be needed
			// {
			//   '@id': registrationUri + '{id-lower}/index.json',
			//   '@type': 'PackageDisplayMetadataUriTemplate/3.0.0-rc',
			//   comment:
			//     'URI template used by NuGet Client to construct display metadata for Packages using ID',
			// },
			// {
			//   '@id': registrationUri + '{id-lower}/{version-lower}.json',
			//   '@type': 'PackageVersionDisplayMetadataUriTemplate/3.0.0-rc',
			//   comment:
			//     'URI template used by NuGet Client to construct display metadata for Packages using ID, Version',
			// },

			// #TODO
			// {
			//   '@id':
			//     'https://api.nuget.org/v3-index/repository-signatures/5.0.0/index.json',
			//   '@type': 'RepositorySignatures/5.0.0',
			//   comment:
			//     "The endpoint for discovering information about this package source's repository signatures.",
			// },
			// {
			//   '@id': 'https://api.nuget.org/v3/catalog0/index.json',
			//   '@type': 'Catalog/3.0.0',
			//   comment: 'Index of the NuGet package catalog.',
			// },
		],
	}

	return JSON.stringify(index, null, 2)
}
