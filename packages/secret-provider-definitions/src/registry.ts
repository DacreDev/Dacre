import { makeSecretProviderDefinitionRegistry } from "@dacre/secret-provider-core/shared/definition";
import * as OnePassword from "@dacre/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
