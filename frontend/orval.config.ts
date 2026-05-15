import { defineConfig } from 'orval';

export default defineConfig({
  iotHealth: {
    input: {
      target: './openapi.json',
    },
    output: {
      target: './lib/orval/api.ts',
      client: 'react-query',
      override: {
        mutator: {
          path: './lib/orval/mutator.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
  },
});
