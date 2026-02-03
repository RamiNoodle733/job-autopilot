const { AdapterRegistry } = require('./registry');
const { GreenhouseJobSourceAdapter, GreenhouseApplyAdapter } = require('./greenhouse');
const { LeverJobSourceAdapter, LeverApplyAdapter } = require('./lever');
const { WorkdayJobSourceAdapter, WorkdayApplyAdapter } = require('./workday');
const { GenericFormApplyAdapter } = require('./generic-form');
const { LinkedInApplyAdapter } = require('./linkedin');

function createDefaultRegistry() {
  const registry = new AdapterRegistry();
  registry.register(new GreenhouseJobSourceAdapter());
  registry.register(new LeverJobSourceAdapter());
  registry.register(new WorkdayJobSourceAdapter());
  registry.register(new GreenhouseApplyAdapter());
  registry.register(new LeverApplyAdapter());
  registry.register(new WorkdayApplyAdapter());
  registry.register(new LinkedInApplyAdapter());
  registry.register(new GenericFormApplyAdapter());
  return registry;
}

module.exports = { createDefaultRegistry };
