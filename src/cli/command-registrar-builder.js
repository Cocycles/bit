/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/init-cmd';
import Create from './commands/create-cmd';
import Push from './commands/push-cmd';
import List from './commands/list-cmd';
import Modify from './commands/modify-cmd';
import Export from './commands/export-cmd';
// import Login from './commands/login-cmd';
// import Logout from './commands/logout-cmd';
import Import from './commands/import-cmd';
// import Remote from './commands/remote-cmd';
import Remove from './commands/remove-cmd';
import Search from './commands/search-cmd';
import Test from './commands/test-cmd';
import Show from './commands/show-cmd';
import Update from './commands/update-cmd';
import Status from './commands/status-cmd';
import Build from './commands/build-cmd';
import Install from './commands/install-cmd';
import Uninstall from './commands/uninstall-cmd';
import Prepare from './commands/_prepare-cmd';
import Upload from './commands/_upload-cmd';
// import Scope from './commands/scope-cmd';
import Fetch from './commands/_fetch-cmd';
import RemoteList from './commands/_list-cmd';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    // new Scope(),
    new Create(),
    new Export(),
    new Import(),
    new Update(),
    new Push(),
    new Status(),
    new Modify(),
    new List(),
    new Show(),
    new Remove(),
    new Search(),
    new Test(),
    new Build(),
    new Install(),
    new Uninstall(),
    new Prepare(),
    new Upload(),
    new Fetch(),
    new RemoteList()
    // new Login(),
    // new Logout(),
    // new Remote(),
  ]);
}
