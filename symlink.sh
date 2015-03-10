#
# Tell npm to install our core dependencies through the github master branches.
#
npm install bigpipe/pagelet bigpipe/bigpipe.js bigpipe/bootstrap-pagelet bigpipe/500-pagelet bigpipe/404-pagelet bigpipe/diagnostics-pagelet

#
# As a lot of dependencies referrer to pagelet's we need to correct their
# dependencies so they all use the pagelet's master branch
#
rm -rf $PWD/node_modules/bootstrap-pagelet/node_modules/pagelet
ln -s $PWD/node_modules/pagelet $PWD/node_modules/bootstrap-pagelet/node_modules

rm -rf $PWD/node_modules/diagnostics-pagelet/node_modules/pagelet
ln -s $PWD/node_modules/pagelet $PWD/node_modules/diagnostics-pagelet/node_modules

rm -rf $PWD/node_modules/404-pagelet/node_modules/pagelet
rm -rf $PWD/node_modules/404-pagelet/node_modules/diagnostics-pagelet
ln -s $PWD/node_modules/pagelet $PWD/node_modules/404-pagelet/node_modules
ln -s $PWD/node_modules/diagnostics-pagelet $PWD/node_modules/404-pagelet/node_modules

rm -rf $PWD/node_modules/500-pagelet/node_modules/pagelet
rm -rf $PWD/node_modules/500-pagelet/node_modules/diagnostics-pagelet
ln -s $PWD/node_modules/pagelet $PWD/node_modules/500-pagelet/node_modules
ln -s $PWD/node_modules/diagnostics-pagelet $PWD/node_modules/500-pagelet/node_modules
