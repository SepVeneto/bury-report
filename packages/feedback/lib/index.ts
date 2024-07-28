import { defineCustomElement } from 'vue'

import Panel from './panel.ce.vue'

const PanelElement = defineCustomElement(Panel)

customElements.define('feedback-panel', PanelElement)
