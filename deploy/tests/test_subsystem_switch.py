import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('subsystems',pathlib.Path(__file__).parents[1]/'switch-research-subsystem.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Runtime:
 def __init__(self,fail=None):self.on={'ocean':True,'low-carbon':False};self.trace=[];self.fail=fail;self.block=False;self.saved=None
 def active(self):return next((k for k,v in self.on.items() if v),None)
 def ready(self,s):return self.on[s]
 def busy(self,s):return self.block
 def stop(self,s):self.trace.append(('stop',s));self.on[s]=False
 def start(self,s):
  self.trace.append(('start',s))
  if s==self.fail:raise module.SwitchError('START_FAILED','failed')
  self.on[s]=True
  assert sum(self.on.values())==1
 def wait(self,s):assert self.on[s]
 def after_ready(self,s):self.trace.append(('ready',s))
 def save(self,s):self.saved=s

class SwitchTests(unittest.TestCase):
 def test_switches_both_directions_without_overlapping_frontends(self):
  r=Runtime();self.assertTrue(module.activate(r,'low-carbon')['ready']);self.assertEqual(r.on,{'ocean':False,'low-carbon':True})
  module.activate(r,'ocean');self.assertEqual(r.on,{'ocean':True,'low-carbon':False})
  self.assertTrue(all(system in module.SYSTEMS for _,system in r.trace))
 def test_idempotent_activation_does_not_restart_the_current_frontend(self):
  r=Runtime();module.activate(r,'ocean');self.assertNotIn(('start','ocean'),r.trace)
 def test_start_failure_restores_previous_system_without_touching_data(self):
  r=Runtime(fail='low-carbon')
  with self.assertRaises(module.SwitchError):module.activate(r,'low-carbon')
  self.assertEqual(r.on,{'ocean':True,'low-carbon':False});self.assertEqual(r.saved,'ocean')
 def test_paid_or_local_report_in_progress_blocks_switch_before_any_stop(self):
  r=Runtime();r.block=True
  with self.assertRaises(module.SwitchError) as e:module.activate(r,'low-carbon')
  self.assertEqual(e.exception.status,409);self.assertEqual(r.trace,[])
 def test_invalid_mode_cannot_be_used_as_a_command_argument(self):
  r=Runtime()
  with self.assertRaises(module.SwitchError):module.activate(r,'ocean; reboot')
  self.assertEqual(r.trace,[])

if __name__=='__main__':unittest.main()
