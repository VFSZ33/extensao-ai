import type { FormDefinition } from "@/lib/form-definition";

import { autodromoContactModalForm } from "@/lib/form-definitions/autodromo-contact-modal";
import { autodromoOfferForm } from "@/lib/form-definitions/autodromo-offer";
import { autodromoSectionForm } from "@/lib/form-definitions/autodromo-section";

export const formDefinitions: FormDefinition[] = [
  autodromoContactModalForm,
  autodromoOfferForm,
  autodromoSectionForm,
];
